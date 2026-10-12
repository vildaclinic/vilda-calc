import { expect, test } from '../support/test-czas.mjs';
import { quickField, quickSelect as select, quickFill as fill, expectAutomaticReference } from '../support/lab-puberty-quick.mjs';

// Fictional contexts only. Exercise the production form, source adapter, engine
// and saved assessment; do not insert disallowed options into native selects.
test.use({ serviceWorkers: 'block' });

const choices = {
  M: ['unspecified', 'G', 'P', 'Ax'],
  F: ['unspecified', 'Th', 'P', 'Ax'],
  unknown: ['unspecified', 'P', 'Ax'],
};
const guest = (changes = {}) => ({
  name: 'Fikcyjny kontekst zależny od płci', sex: 'M', age: 14, ageMonths: 0, tannerStage: '3',
  advanced: { testicularVolume: { value: 6, unit: 'mL', method: 'Prader' } },
  ...changes,
});

async function open(page) {
  await page.route('**/*', (route) => {
    const url = new URL(route.request().url());
    return url.hostname === '127.0.0.1' || /^(data|blob):$/.test(url.protocol) ? route.continue() : route.abort();
  });
  await page.addInitScript(() => {
    localStorage.setItem('vilda-terms-accepted-v1', JSON.stringify({ version: 1, acceptedAtISO: new Date().toISOString() }));
    const date = new Date();
    const iso = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    localStorage.setItem('vilda-reminders-shown-v1', `${iso}|${Date.now()}`);
    localStorage.setItem('vilda-reminders-closed-v1', `${iso}|${Date.now()}`);
  });
  await page.goto('/przelicznik-jednostek.html', { waitUntil: 'load' });
  await page.waitForFunction(() => Boolean(window.VildaLabPubertyRuntime));
  const consent = page.locator('#consent-decline');
  if (await consent.isVisible()) await consent.click();
}

async function choose(page, analyte = 'lh') {
  await page.locator('#labSubstance').fill(analyte.toUpperCase());
  await page.locator(`#labSubstanceDropdown [data-id="${analyte}"]`).click();
  await page.locator('#labUnit').selectOption('IU/L');
  await page.locator('#labValue').fill('2');
}

async function shared(page, user) {
  await page.evaluate((next) => {
    if (!window.VildaPersistence.writeShared(next, { force: true })) throw new Error('Cannot seed fictional main form');
    window.dispatchEvent(new Event('focus'));
  }, user);
}

const snapshot = (page, analyte = 'lh') => page.evaluate((testKey) => window.VildaLabPubertyRuntime.getAssessment({
  testKey, raw: document.getElementById('labValue').value, unit: document.getElementById('labUnit').value,
}), analyte);

async function expectChoices(page, sex) {
  const input = await quickField(page, 'Kind');
  expect(await input.locator('option').evaluateAll((options) => options.map((option) => option.value))).toEqual(choices[sex || 'unknown']);
}

async function expectNoVolume(page) {
  for (const name of ['TesticularVolume', 'VolumeMethod']) {
    const input = page.locator(`#labPuberty${name}`);
    await expect(input).toHaveCount(0);
  }
}

async function expectReadableSummaries(page) {
  for (const id of ['labPubertyPatientSummary']) {
    const metrics = await page.locator(`#${id}`).evaluate((element) => {
      const rect = element.getBoundingClientRect();
      return { width: rect.width, height: rect.height, lineHeight: parseFloat(getComputedStyle(element).lineHeight) };
    });
    // A global mobile button width once collapsed these spans to one letter per
    // line. No horizontal overflow alone would detect that unusable layout.
    expect(metrics.width, `${id} retains readable line width`).toBeGreaterThanOrEqual(100);
    expect(metrics.height, `${id} stays readable in at most four lines`).toBeLessThanOrEqual(metrics.lineHeight * 4 + 1);
  }
  // The scope is a full paragraph, not the former short summary beside a
  // button. Its natural line count depends on font metrics and viewport width;
  // it must retain readable width and display all of its wrapped text.
  const scope = page.locator('#labPubertyAssessment [data-reference-conditions="automatic-source-reference"]');
  await expect(scope).toBeVisible();
  const scopeMetrics = await scope.evaluate((element) => ({
    width: element.getBoundingClientRect().width,
    clientWidth: element.clientWidth, scrollWidth: element.scrollWidth,
    clientHeight: element.clientHeight, scrollHeight: element.scrollHeight,
  }));
  expect(scopeMetrics.width, 'scope retains readable line width').toBeGreaterThanOrEqual(100);
  expect(scopeMetrics.scrollWidth, 'scope text is not clipped horizontally').toBeLessThanOrEqual(scopeMetrics.clientWidth + 1);
  expect(scopeMetrics.scrollHeight, 'scope text is not clipped vertically').toBeLessThanOrEqual(scopeMetrics.clientHeight + 1);
}

async function installPendingSource(page) {
  await page.evaluate(() => window.VildaSession.ensureAuthLoaded());
  await page.waitForFunction(() => Boolean(window.VildaVault));
  await page.evaluate(() => window.VildaVault.createUser('E2e#SexPending!2026', { label: 'Fikcyjny sejf odczytu płci', iterations: 10000 }));
  await page.reload({ waitUntil: 'load' });
  await page.waitForFunction(() => window.VildaVault?.isUnlocked() && window.VildaLabPubertyRuntime && window.VildaPubertySource
    && !document.documentElement.classList.contains('vilda-auth-locked'));
  await page.evaluate(() => {
    const original = window.VildaVault.getPatient.bind(window.VildaVault);
    const pending = new Map();
    const records = Object.fromEntries([
      ['sex-source-a', { name: 'Fikcyjny odczyt A', sex: 'M', age: 14, ageMonths: 0, tannerStage: '4' }],
      ['sex-source-b', { name: 'Fikcyjny odczyt B', sex: 'M', age: 6, ageMonths: 0, tannerStage: '1' }],
    ].map(([id, user]) => [id, { patientId: id, snapshots: [{ payload: { user, puberty: {} } }] }]));
    window.VildaVault.getPatient = (id) => Object.hasOwn(records, id)
      ? new Promise((resolve) => {
        if (!pending.has(id)) pending.set(id, []);
        pending.get(id).push(resolve);
      }) : original(id);
    window.__sexSource = {
      load(id) {
        window._vildaCurrentPatientId = id;
        sessionStorage.setItem('vildaCurrentPatientId', id);
        if (!window.VildaPersistence.writeShared({ ...records[id].snapshots[0].payload.user }, { force: true })) throw new Error('Cannot load fictional source');
        document.dispatchEvent(new CustomEvent('vilda:patient-loaded', { detail: { patientId: id } }));
      },
      refresh(id, changes = {}) {
        Object.assign(records[id].snapshots[0].payload.user, changes);
        if (!window.VildaPersistence.writeShared({ ...records[id].snapshots[0].payload.user }, { force: true })) throw new Error('Cannot update fictional source');
        document.dispatchEvent(new CustomEvent('vilda:sync-status-changed'));
      },
      complete(id) {
        const waiting = pending.get(id) || [];
        if (!waiting.length) throw new Error('No production source read is pending for ' + id);
        pending.delete(id);
        waiting.forEach((resolve) => resolve(structuredClone(records[id])));
      },
    };
    window.VildaPubertySource.zapomnij();
  });
  await page.evaluate(() => window.__sexSource.load('sex-source-a'));
  await completeSource(page, 'sex-source-a');
  await choose(page);
  await select(page, 'Kind', 'G');
  await select(page, 'Stage', '3');
}

async function completeSource(page, id) {
  await page.evaluate((patientId) => window.__sexSource.complete(patientId), id);
  await expect.poll(() => page.evaluate((patientId) => window.VildaPubertySource.kontekstPacjenta(patientId).status, id)).toBe('ready');
}

async function expectPendingExcluded(page) {
  await expect(page.locator('#labPubertySex')).toHaveValue('');
  const pending = await snapshot(page);
  expect(pending.evaluation.input).toMatchObject({ sex: null, puberty: { kind: 'unspecified', stage: null }, testicularVolume: { value: null, method: '' } });
  expect(pending.evaluation.biochemical.byStage.status).toBe('unavailable');
}

for (const analyte of ['lh', 'fsh']) {
  test(`${analyte.toUpperCase()}: native choices follow sex and incompatible observations never return after switching back`, async ({ page }) => {
    await open(page);
    await choose(page, analyte);
    await expectChoices(page, '');
    await expectNoVolume(page);
    await expect(page.locator('#labPubertyStageHint')).toContainText('Wybierz płeć');

    await select(page, 'Sex', 'M');
    await expectChoices(page, 'M');
    await select(page, 'Kind', 'G');
    await select(page, 'Stage', '4');
    const male = await snapshot(page, analyte);
    expect(male.evaluation.input.puberty).toMatchObject({ kind: 'G', stage: 4 });
    expect(male.evaluation.input.testicularVolume).toMatchObject({ value: null, method: '' });

    await select(page, 'Sex', 'F');
    await expectChoices(page, 'F');
    await expect(page.locator('#labPubertyKind')).toHaveValue('unspecified');
    await expect(page.locator('#labPubertyStage')).toHaveValue('');
    await expectNoVolume(page);
    await expect(page.locator('#labPubertyPatientContext')).toContainText('niezgodne z wybraną płcią');
    const female = await snapshot(page, analyte);
    expect(female.evaluation.input).toMatchObject({ sex: 'F', puberty: { kind: 'unspecified', stage: null }, testicularVolume: { value: null, method: '' } });

    await select(page, 'Kind', 'Th');
    await select(page, 'Stage', '3');
    await select(page, 'Sex', 'M');
    await expectChoices(page, 'M');
    await expect(page.locator('#labPubertyKind')).toHaveValue('unspecified');
    await expect(page.locator('#labPubertyStage')).toHaveValue('');
    await expectNoVolume(page);
    expect((await snapshot(page, analyte)).evaluation.input.puberty).toMatchObject({ kind: 'unspecified', stage: null });
    await select(page, 'Sex', 'F');
    await expect(page.locator('#labPubertyKind')).toHaveValue('unspecified');
    await expect(page.locator('#labPubertyStage')).toHaveValue('');
    await expectNoVolume(page);
  });
}

test('P remains available for both sexes and unknown sex, while Ax has no fabricated Tanner stage', async ({ page }) => {
  await open(page);
  await choose(page);
  await select(page, 'Sex', 'M');
  await fill(page, 'AgeYears', '14');
  await select(page, 'Kind', 'P');
  await select(page, 'Stage', '3');
  for (const sex of ['F', '', 'M']) {
    await select(page, 'Sex', sex);
    await expectChoices(page, sex);
    await expect(page.locator('#labPubertyKind')).toHaveValue('P');
    await expect(page.locator('#labPubertyStage')).toHaveValue('3');
    const saved = await snapshot(page);
    expect(saved.evaluation.input.puberty).toMatchObject({ kind: 'P', stage: 3 });
    expect(saved.evaluation.biochemical.byStage.status).toBe('unavailable');
  }
  await select(page, 'Kind', 'Ax');
  for (const sex of ['F', '', 'M']) {
    await select(page, 'Sex', sex);
    await expect(page.locator('#labPubertyKind')).toHaveValue('Ax');
    await expect(page.locator('#labPubertyStage')).toBeHidden();
    await expect(page.locator('#labPubertyStage')).toBeDisabled();
    expect((await snapshot(page)).evaluation.input.puberty).toMatchObject({ kind: 'Ax', stage: null });
  }
});

test('main-form imports remain untyped and a source refresh cannot restore observations removed by a local sex correction', async ({ page }) => {
  await open(page);
  await shared(page, guest());
  await choose(page);
  await expectChoices(page, 'M');
  await expect(page.locator('#labPubertyKind')).toHaveValue('unspecified');
  await expect(page.locator('#labPubertyStage')).toHaveValue('3');
  await expectNoVolume(page);
  const before = await page.evaluate(() => window.VildaPersistence.readShared());
  expect((await snapshot(page)).evaluation.input).toMatchObject({ puberty: { kind: 'unspecified', stage: 3 }, testicularVolume: { value: null, method: '' } });

  await select(page, 'Kind', 'G');
  await select(page, 'Sex', 'F');
  expect(await page.evaluate(() => window.VildaPersistence.readShared())).toEqual(before);
  await shared(page, guest({ age: 15, tannerStage: '5', advanced: { testicularVolume: { value: 8, unit: 'mL', method: 'ultrasound' } } }));
  await expect(page.locator('#labPubertySex')).toHaveValue('F');
  await expect(page.locator('#labPubertyAgeYears')).toHaveValue('15');
  await expect(page.locator('#labPubertyKind')).toHaveValue('unspecified');
  await expect(page.locator('#labPubertyStage')).toHaveValue('');
  await expectNoVolume(page);
  await select(page, 'Sex', 'M');
  await shared(page, guest({ age: 16, tannerStage: '5', advanced: { testicularVolume: { value: 10, unit: 'mL', method: 'Prader' } } }));
  await expect(page.locator('#labPubertyAgeYears')).toHaveValue('16');
  await expect(page.locator('#labPubertyStage')).toHaveValue('');
  await expectNoVolume(page);
  const after = await snapshot(page);
  expect(after.evaluation.input.puberty).toMatchObject({ kind: 'unspecified', stage: null });
  expect(after.evaluation.input.testicularVolume.value).toBeNull();
});

test('current context keeps sex restrictions after age and source changes, without importing removed measurements', async ({ page }) => {
  await open(page);
  await shared(page, guest({ dobISO: '2012-06-17', puberty: { history: { cnsSymptoms: 'yes', regression: 'yes' } } }));
  await choose(page, 'fsh');
  await expect(page.locator('#labPubertyOpenDate, #labPubertySectionDate, #labPubertySampleDate, #labPubertyBirthDate, #labPubertyClearDate, #labPubertyOpenExtra, #labPubertySectionExtra, #labPubertyCnsSymptoms, #labPubertyRegression')).toHaveCount(0);
  await select(page, 'Sex', 'F');
  await fill(page, 'AgeYears', '8');
  await expectChoices(page, 'F');
  await expectNoVolume(page);
  await select(page, 'Kind', 'Th');
  await select(page, 'Stage', '2');
  const before = await snapshot(page, 'fsh');
  expect(before.evaluation.input).toMatchObject({
    contextBasis: 'current-patient', birthDateISO: null, sampleDateISO: null, sex: 'F', age: { years: 8 },
    puberty: { kind: 'Th', stage: 2, appliesToSample: false, appliesToCurrentContext: true },
    testicularVolume: { value: null, method: '' }, history: { cnsSymptoms: 'unknown', regression: 'unknown' },
  });
  await shared(page, guest({ age: 16, dobISO: '2010-06-17', tannerStage: '5',
    puberty: { history: { cnsSymptoms: 'yes', regression: 'yes' } } }));
  await expectChoices(page, 'F');
  await expect(page.locator('#labPubertyAgeYears')).toHaveValue('8');
  await expect(page.locator('#labPubertyStage')).toHaveValue('2');
  await expectNoVolume(page);
  const after = await snapshot(page, 'fsh');
  expect(after.evaluation.input).toEqual(before.evaluation.input);
});

test('a pending same-patient refresh excludes manual observations until the same male sex is confirmed again', async ({ page }) => {
  await open(page);
  await installPendingSource(page);
  await page.evaluate(() => window.__sexSource.refresh('sex-source-a'));
  await expectPendingExcluded(page);
  await completeSource(page, 'sex-source-a');
  await expect(page.locator('#labPubertySex')).toHaveValue('M');
  await expect(page.locator('#labPubertyKind')).toHaveValue('G');
  await expect(page.locator('#labPubertyStage')).toHaveValue('3');
  await expectNoVolume(page);
  expect((await snapshot(page)).evaluation.input).toMatchObject({ sex: 'M', puberty: { kind: 'G', stage: 3 }, testicularVolume: { value: null, method: '' } });
});

test('a completed refresh with female sex discards suspended male observations and they cannot return on a later male refresh', async ({ page }) => {
  await open(page);
  await installPendingSource(page);
  await page.evaluate(() => window.__sexSource.refresh('sex-source-a', { sex: 'F' }));
  await expectPendingExcluded(page);
  await completeSource(page, 'sex-source-a');
  await expectChoices(page, 'F');
  await expect(page.locator('#labPubertyKind')).toHaveValue('unspecified');
  await expect(page.locator('#labPubertyStage')).toHaveValue('');
  await expectNoVolume(page);
  await page.evaluate(() => window.__sexSource.refresh('sex-source-a', { sex: 'M' }));
  await completeSource(page, 'sex-source-a');
  await expectChoices(page, 'M');
  await expect(page.locator('#labPubertyKind')).toHaveValue('unspecified');
  await expect(page.locator('#labPubertyStage')).toHaveValue('');
  await expectNoVolume(page);
  expect((await snapshot(page)).evaluation.input.testicularVolume.value).toBeNull();
});

test('another patient and a late source response cannot inherit observations suspended during the preceding patient refresh', async ({ page }) => {
  await open(page);
  await installPendingSource(page);
  await page.evaluate(() => window.__sexSource.refresh('sex-source-a'));
  await expectPendingExcluded(page);
  await page.evaluate(() => window.__sexSource.load('sex-source-b'));
  await completeSource(page, 'sex-source-b');
  await page.evaluate(() => window.__sexSource.complete('sex-source-a'));
  await expect(page.locator('#labPubertySex')).toHaveValue('M');
  await expect(page.locator('#labPubertyAgeYears')).toHaveValue('6');
  await expect(page.locator('#labPubertyKind')).toHaveValue('unspecified');
  await expect(page.locator('#labPubertyStage')).toHaveValue('1');
  await expectNoVolume(page);
  await expect(page.locator('#labValue')).toHaveValue('');
  await page.locator('#labValue').fill('2');
  const current = await snapshot(page);
  expect(current.evaluation.input).toMatchObject({ sex: 'M', age: { years: 6 }, puberty: { kind: 'unspecified', stage: 1 }, testicularVolume: { value: null } });
});

test('a recorded Th onset is not relabelled after a sex correction and an already pinned assessment keeps its original context', async ({ page }) => {
  await open(page);
  await page.evaluate(() => window.VildaSession.ensureAuthLoaded());
  await page.waitForFunction(() => Boolean(window.VildaVault));
  await page.evaluate(() => window.VildaVault.createUser('E2e#SexAwareLH!2026', { label: 'Fikcyjny sejf cech pokwitania', iterations: 10000 }));
  await page.reload({ waitUntil: 'load' });
  await page.waitForFunction(() => window.VildaVault?.isUnlocked() && window.VildaAuthUI && window.VildaLabPubertyRuntime
    && !document.documentElement.classList.contains('vilda-auth-locked'));
  const user = guest({ sex: 'F', advanced: {} });
  const patientId = await page.evaluate(async (fictional) => {
    const saved = await window.VildaVault.savePatient({ name: fictional.name, user: fictional, puberty: { onsetAgeYears: 6.5 } }, { dedup: false });
    window._vildaCurrentPatientId = saved.patientId;
    sessionStorage.setItem('vildaCurrentPatientId', saved.patientId);
    if (!window.VildaPersistence.writeShared(fictional, { force: true })) throw new Error('Cannot prepare fictional record');
    document.dispatchEvent(new CustomEvent('vilda:patient-loaded', { detail: { patientId: saved.patientId } }));
    return saved.patientId;
  }, user);
  await expect.poll(() => page.evaluate((id) => window.VildaPubertySource.kontekstPacjenta(id).status, patientId)).toBe('ready');
  await choose(page);
  await select(page, 'Kind', 'Th');
  await expectAutomaticReference(page);
  const before = await snapshot(page);
  expect(before.evaluation.input.onset).toMatchObject({ kind: 'Th', age: { years: 6, precision: 'year' } });
  await page.locator('#labPinResultBtn').click();
  await page.locator('#labPinComment').fill('Fikcyjna ocena Th przed korektą kontekstu');
  await page.locator('#labPinSave').click();
  await expect(page.locator('#labPinOverlay')).toHaveCount(0);
  const notes = await page.evaluate((id) => window.VildaVault.listPatientNotesForPatient(id), patientId);
  expect(notes).toHaveLength(1);
  expect(notes[0].labResult.assessment.evaluation).toEqual(before.evaluation);

  // Change only today's main form. The stored record still documents Th onset.
  await shared(page, { ...user, sex: 'M' });
  await expectChoices(page, 'M');
  await expect(page.locator('#labPubertyKind')).toHaveValue('unspecified');
  await expect(page.locator('#labPubertyStage')).toHaveValue('');
  await expect(page.locator('#labPubertyPatientContext')).toContainText('niezgodne z wybraną płcią');
  const corrected = await snapshot(page);
  expect(corrected.evaluation.input.onset).toMatchObject({ kind: 'unspecified', age: null, dateISO: null, confirmedPubertalOnset: false });
  const saved = await page.evaluate((id) => window.VildaVault.getPatientNote(id), notes[0].id);
  expect(saved.labResult.assessment).toEqual(notes[0].labResult.assessment);
  await page.evaluate((id) => window.VildaAuthUI.showPatientCard(id), patientId);
  await page.locator('.vilda-patient-tab[data-tab="timeline"]').click();
  const recorded = page.locator(`.vilda-lab-assessment-history-row[data-note-id="${saved.id}"] .vilda-lab-assessment`);
  await expect(recorded).toContainText('Th3');
  await expect(recorded.locator('[data-clinical-code="early_onset_history"]')).toBeVisible();
});

for (const width of [320, 390, 600]) {
  test.describe(`sex-dependent controls at ${width} px`, () => {
    test.use({ viewport: { width, height: 844 }, isMobile: true, hasTouch: true });
    test('keeps native choices and expanded details usable without horizontal scrolling', async ({ page }) => {
      await open(page);
      await shared(page, guest({ tannerStage: '' }));
      await choose(page);
      await expectReadableSummaries(page);
      await select(page, 'Sex', 'M');
      await select(page, 'Kind', 'G');
      await select(page, 'Stage', '3');
      await select(page, 'Sex', 'F');
      await expectChoices(page, 'F');
      await expectNoVolume(page);
      await expect(page.locator('#labPubertyPatientContext')).toBeVisible();
      await expectReadableSummaries(page);
      await expect(page.locator('#labPubertyOpenRange, #labPubertySectionRange')).toHaveCount(0);
      for (const section of ['Stage', 'Patient']) {
        await quickField(page, section === 'Stage' ? 'Kind' : 'Sex');
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1)).toBe(true);
      }
    });
  });
}
