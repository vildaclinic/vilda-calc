import { expect, test } from '../support/test-czas.mjs';

// Fictional patients only. These are source phase-group summaries, not
// laboratory reference ranges, exact-age medians or a new curve to plot.
test.use({ serviceWorkers: 'block', reducedMotion: 'reduce' });
test.setTimeout(150_000);
const host = page => page.locator('#labE2PhaseSource');
const card = page => host(page).locator('.vilda-e2-phase-source');
const chart = page => page.locator('#labHormoneLifespan');
const details = page => card(page).locator('details');
const median = page => card(page).locator('[data-e2-phase="median"]');

async function loadPatient(page, { age = 30, months = 0, sex = 'F', gnrhaStatus = '' } = {}) {
  const id = await page.evaluate(async ({ age, months, sex, gnrhaStatus }) => {
    const user = { name: 'Fikcyjna Osoba E2 Fazy', sex, age, ageMonths: months };
    const saved = await window.VildaVault.savePatient({ name: user.name, user,
      puberty: gnrhaStatus ? { gnrhaStatus } : {} }, { dedup: false });
    window._vildaCurrentPatientId = saved.patientId;
    sessionStorage.setItem('vildaCurrentPatientId', saved.patientId);
    if (!window.VildaPersistence.writeShared(user, { force: true })) throw new Error('Cannot load fictional phase E2 patient');
    document.dispatchEvent(new CustomEvent('vilda:patient-loaded', { detail: { patientId: saved.patientId } }));
    return saved.patientId;
  }, { age, months, sex, gnrhaStatus });
  await expect.poll(() => page.evaluate(id => window.VildaPubertySource.kontekstPacjenta(id).status, id)).toBe('ready');
  return id;
}

async function settleMain(page) {
  await page.waitForFunction(() => {
    const persistence = window.VildaPersistence;
    const state = window.vildaGetPersistAutosaveCoalescingSnapshot?.();
    return persistence && !persistence.isAutosaveSuppressed() && !persistence.isRestoring()
      && !window.VildaDobAge?.restorePending?.() && state && !state.hasPendingSaveTimer
      && !state.hasPendingForceSaveTimer && !state.hasPendingElementRefreshTimer;
  });
}

async function prepare(page, { width = 1440, main = false } = {}) {
  await page.setViewportSize({ width, height: 1000 });
  await page.route('**/*', route => {
    const url = new URL(route.request().url());
    return url.hostname === '127.0.0.1' || /^(data|blob):$/.test(url.protocol) ? route.continue() : route.abort();
  });
  await page.addInitScript(() => {
    localStorage.setItem('vilda-terms-accepted-v1', JSON.stringify({ version: 1, acceptedAtISO: new Date().toISOString() }));
    const date = new Date();
    const iso = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    for (const state of ['shown', 'closed']) localStorage.setItem(`vilda-reminders-${state}-v1`, `${iso}|${Date.now()}`);
  });
  await page.goto('/przelicznik-jednostek.html', { waitUntil: 'load' });
  await page.evaluate(() => window.VildaSession.ensureAuthLoaded());
  await page.waitForFunction(() => Boolean(window.VildaVault));
  await page.evaluate(() => window.VildaVault.createUser('E2e#FictionalPhaseEstradiol!2026', {
    label: 'Fikcyjny sejf median faz E2', iterations: 10000,
  }));
  await page.reload({ waitUntil: 'load' });
  await page.waitForFunction(() => window.VildaVault?.isUnlocked() && window.VildaE2PhaseSourceRuntime
    && !document.documentElement.classList.contains('vilda-auth-locked'));
  const consent = page.locator('#consent-decline');
  if (await consent.isVisible()) await consent.click();
  const id = await loadPatient(page, { age: main ? 40 : 30 });
  if (main) {
    await page.goto('/index.html', { waitUntil: 'load' });
    await page.waitForFunction(() => window.VildaVault?.isUnlocked() && window.VildaDobAge
      && typeof window.applyLoadedData === 'function');
    await settleMain(page);
    await page.evaluate(async id => {
      const record = await window.VildaVault.getPatient(id);
      window.applyLoadedData(record.snapshots[0].payload);
      document.dispatchEvent(new CustomEvent('vilda:patient-loaded', { detail: {
        patientId: id, savedAtISO: record.snapshots[0].savedAtISO, snapshotCount: 1, source: 'pick',
      } }));
    }, id);
    await expect(page.locator('#vildaLcmNew')).toBeVisible();
    await page.locator('#vildaLcmNew').click();
    await expect(page.locator('#vildaLoadChoiceModal')).toHaveCount(0);
    await settleMain(page);
    await expect(page.locator('#sex')).toHaveValue('F');
    await page.locator('#age').fill('30');
    await page.locator('#ageMonths').fill('0');
    await page.locator('#ageMonths').dispatchEvent('change');
    await settleMain(page);
    await expect.poll(() => page.evaluate(() => {
      const user = window.VildaPersistence.readShared();
      return { sex: user.sex, age: Number(user.age), months: Number(user.ageMonths) };
    })).toEqual({ sex: 'F', age: 30, months: 0 });
    await page.goto('/przelicznik-jednostek.html', { waitUntil: 'load' });
    await page.waitForFunction(() => window.VildaE2PhaseSourceRuntime && window.VildaVault?.isUnlocked());
    await expect.poll(() => page.evaluate(id => window.VildaPubertySource.kontekstPacjenta(id).status, id)).toBe('ready');
  }
  return id;
}

async function choose(page, raw = '206', analyte = 'estradiol') {
  await page.locator('#labSubstance').fill(analyte === 'estradiol' ? 'Estradiol' : 'Kortyzol');
  await page.locator(`#labSubstanceDropdown [data-id="${analyte}"]`).click();
  if (analyte === 'estradiol') {
    await page.locator('#labUnit').selectOption('pg/mL');
    await page.locator('#labUnitTarget').selectOption('pg/mL');
  }
  await page.locator('#labValue').fill(raw);
}

async function phase(page, value) {
  if (await page.locator('#labPatientOverride').isHidden()) await page.locator('#labPatientToggle').click();
  await page.locator('#labOverrideCycle').selectOption(value);
}

async function expectCard(page, value = 198) {
  await expect(host(page)).toBeVisible();
  await expect(card(page)).toHaveAttribute('data-source-id', 'anckaert2021-female-e2-phase-medians');
  await expect(median(page)).toHaveAttribute('data-source-value', String(value));
  await expect(median(page)).toHaveAttribute('data-source-unit', 'pmol/L');
  await expect(median(page)).toContainText(`${value}`);
  await expect(median(page)).toContainText('pmol/L');
  await expect(card(page)).toContainText(/18.*37/);
  await expect(card(page)).toContainText(/nie jest to|nie.*zakres referencyjny/i);
  await expect(card(page).locator('input, select, textarea, [data-result-point], [data-patient-concentration], [data-median-point]')).toHaveCount(0);
  await expect(chart(page).locator('[data-patient-concentration="e2"], [data-result-point]')).toHaveCount(0);
  await expect(card(page)).not.toContainText(/poniżej mediany|powyżej mediany/i);
}

async function expectCleared(page) {
  await expect(host(page)).toBeHidden();
  await expect(card(page)).not.toHaveAttribute('data-source-id');
  await expect(median(page)).toBeEmpty();
  await expect(card(page).locator('[data-e2-phase="sources"]')).toBeEmpty();
  await expect(details(page)).not.toHaveAttribute('open');
}

async function geometry(page) {
  return chart(page).locator('[data-female-stable-line="e2"]').evaluateAll(paths => paths.map(path => ({
    d: path.getAttribute('d'), divisor: path.dataset.divisor, ceiling: path.dataset.ceiling,
    viewBox: path.ownerSVGElement.getAttribute('viewBox'),
  })));
}

async function expectFits(page) {
  expect(await host(page).evaluate(element => element.scrollWidth <= element.clientWidth + 1)).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
}

for (const width of [1440, 320, 390]) test(`E2 phase summary preserves the existing result and RI panel at ${width}px`, async ({ page }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await prepare(page, { width, main: width === 1440 });
  await choose(page);
  // No extra question blocks the numerical result when phase is not known.
  await expect(page.locator('#labResultBig .lab-result-big-value')).toHaveText('206');
  await expect(page.locator('#labPatientOverride')).toBeHidden();
  await expect(page.locator('#labRangeBlock [data-reference-variants="estradiol"] [data-variant-id]')).toHaveCount(4);
  await expectCleared(page);
  const shared = await page.evaluate(() => window.VildaPersistence.readShared());
  const original = await geometry(page);
  expect(original.length).toBeGreaterThan(0);
  expect(original.every(line => line.divisor === '264' && line.ceiling === '1')).toBe(true);
  await phase(page, 'ovulation');
  await expectCard(page, 757);
  // This is the user's existing panel: a real RI axis and marker, a large
  // result and its established status, independently of the source median.
  await expect(page.locator('#labResultBig .lab-result-big-value')).toHaveText('206');
  await expect(page.locator('#labResultBig .lab-result-big-unit')).toHaveText('pg/mL');
  await expect(page.locator('#labResultStatus')).toContainText('w zakresie normy');
  await expect(page.locator('#labRangeBlock .lab-range-scale')).toHaveCount(1);
  await expect(page.locator('#labRangeBlock .lab-range-marker')).toHaveCount(1);
  await expect(page.locator('#labResultSourceLine')).toContainText('104–398 pg/mL');
  await expect(page.locator('#labShowAllToggle')).toBeVisible();
  await expect(details(page)).not.toHaveAttribute('open');
  expect(await host(page).evaluate(element => Boolean(element.compareDocumentPosition(document.getElementById('labHormoneLifespan'))
    & Node.DOCUMENT_POSITION_PRECEDING))).toBe(true);
  for (const [key, value] of [['follicular', 198], ['luteal', 412], ['ovulation', 757]]) {
    await phase(page, key);
    await expectCard(page, value);
    await expect.poll(() => geometry(page)).toEqual(original);
    await expectFits(page);
  }
  await host(page).screenshot({ path: test.info().outputPath(`e2-phase-${width}-closed.png`) });
  await details(page).locator('summary').click();
  await expect(details(page)).toHaveAttribute('open', '');
  await expect(details(page)).toContainText(/Anckaert|2021/);
  await expect(details(page)).toContainText('Roche Elecsys Estradiol III');
  await expect(details(page)).toContainText('81');
  await expect(details(page)).toContainText(/uczestniczki|uczestniczek/i);
  await expect(details(page).locator('a[href="https://pmc.ncbi.nlm.nih.gov/articles/PMC8042396/"]')).toBeVisible();
  await expectFits(page);
  await host(page).screenshot({ path: test.info().outputPath(`e2-phase-${width}-open.png`) });
  for (const unit of ['pmol/L', 'pg/mL']) {
    await page.locator('#labUnitTarget').selectOption(unit);
    await expectCard(page, 757);
    await expect.poll(() => geometry(page)).toEqual(original);
  }
  for (const raw of ['0', '10000', '206']) {
    await page.locator('#labValue').fill(raw);
    await expectCard(page, 757);
    await expect.poll(() => geometry(page)).toEqual(original);
  }
  await expect(page.locator('#labResultStatus')).toContainText('w zakresie normy');
  expect(await page.evaluate(() => window.VildaPersistence.readShared())).toEqual(shared);
  expect(errors).toEqual([]);
});

test('E2 phase source uses the whole age and clears its facts for chart, reproductive and patient changes', async ({ page }) => {
  await prepare(page, { width: 320 });
  await choose(page);
  await phase(page, 'follicular');
  await expectCard(page);
  const original = await geometry(page);
  for (const view of ['mini', 'puberty']) {
    await chart(page).locator(`[data-view="${view}"]`).click();
    await expectCleared(page);
    await chart(page).locator('[data-view="life"]').click();
    await expectCard(page);
  }
  await chart(page).locator('[data-hormone="e2"]').click();
  await expectCleared(page);
  await chart(page).locator('[data-hormone="e2"]').click();
  await expectCard(page);
  // E2 alone has no sex-comparison model. Selecting LH makes the existing
  // comparison control available; its state must also hide this adult card.
  await chart(page).locator('[data-hormone="lh"]').click();
  await chart(page).locator('.vhl-compare-toggle').click();
  await expectCleared(page);
  await chart(page).locator('[data-view="life"]').click();
  await expectCard(page);
  await chart(page).locator('[data-hormone="lh"]').click();
  await chart(page).locator('.vhl-expand').click();
  await expect(page.locator('dialog.vhl-fullscreen-dialog')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('dialog.vhl-fullscreen-dialog')).toHaveCount(0);
  await expectCard(page);
  await expect.poll(() => geometry(page)).toEqual(original);
  for (const [age, months, eligible] of [[17, 11, false], [18, 0, true], [36, 11, true], [37, 0, false], [40, 0, false], [30, 0, true]]) {
    await page.locator('#labOverrideAge').fill(String(age));
    await page.locator('#labOverrideAgeMonths').fill(String(months));
    if (eligible) await expectCard(page);
    else await expectCleared(page);
  }
  for (const value of ['', 'postmenopause', 'pregnancy_t1', 'pregnancy_t2', 'pregnancy_t3']) {
    await phase(page, value);
    await expectCleared(page);
    await expect(page.locator('#labResultBig .lab-result-big-value')).toHaveText('206');
  }
  await phase(page, 'luteal');
  await expectCard(page, 412);
  await page.locator('#labOverrideReset').click();
  await expect(page.locator('#labOverrideCycle')).toHaveValue('');
  await expectCleared(page);
  await phase(page, 'follicular');
  await expectCard(page);
  await page.locator('#labOverrideSex').selectOption('M');
  await expectCleared(page);
  await page.locator('#labOverrideSex').selectOption('F');
  await expect(page.locator('#labOverrideCycle')).toHaveValue('');
  await expectCleared(page);
  await phase(page, 'follicular');
  await expectCard(page);
  for (const raw of ['', 'abc', '-1']) {
    await page.locator('#labValue').fill(raw);
    await expectCleared(page);
  }
  await page.locator('#labValue').fill('206');
  await expectCard(page);
  await choose(page, '10', 'cortisol');
  await expectCleared(page);
  await choose(page);
  await phase(page, 'follicular');
  await expectCard(page);
  await loadPatient(page, { gnrhaStatus: 'w-trakcie' });
  await expect(page.locator('#labValue')).toHaveValue('');
  await expect(page.locator('#labOverrideCycle')).toHaveValue('');
  await choose(page);
  await phase(page, 'follicular');
  await expectCleared(page);
  await loadPatient(page);
  await choose(page);
  await phase(page, 'follicular');
  await expectCard(page);
  await page.evaluate(() => window.VildaVault.lock());
  await expect(host(page)).toBeHidden();
  await expect(page.locator('[data-source-id="anckaert2021-female-e2-phase-medians"], #labE2PhaseSource [data-source-value]')).toHaveCount(0);
  await page.evaluate(() => document.querySelector('#labHormoneLifespan [data-view="life"]')?.click());
  await expect(host(page)).toBeHidden();
});

test('E2 inequalities retain their operator and the phase statistic never changes saved laboratory assessments', async ({ page }) => {
  const id = await prepare(page, { width: 390 });
  await choose(page);
  await phase(page, 'ovulation');
  await expectCard(page, 757);
  const original = await geometry(page);
  await page.locator('#labUnitTarget').selectOption('pmol/L');
  for (const raw of ['<5', '>5', '<LOD', '<LOQ']) {
    await page.locator('#labValue').fill(raw);
    await expectCard(page, 757);
    await expect(page.locator('#labValue')).toHaveValue(raw);
    await expect(page.locator('#labResultBig')).toContainText(raw === '<5' ? '<18,4' : raw === '>5' ? '>18,4' : raw);
    await expect(page.locator('#labRangeBlock .lab-range-marker')).toHaveCount(0);
    await expect(page.locator('#labResultStatus')).toBeEmpty();
    await expect.poll(() => geometry(page)).toEqual(original);
  }
  await page.locator('#labUnitTarget').selectOption('pg/mL');
  await page.locator('#labValue').fill('206');
  await expectCard(page, 757);
  await expect(page.locator('#labResultStatus')).toContainText('w zakresie normy');
  await page.locator('#labPinResultBtn').click();
  await expect(page.locator('#labPinOverlay')).not.toContainText('Anckaert');
  await page.locator('#labPinSave').click();
  await expect(page.locator('#labPinOverlay')).toHaveCount(0);
  const saved = await page.evaluate(id => window.VildaVault.listPatientNotesForPatient(id), id);
  expect(saved).toHaveLength(1);
  const labResult = saved[0].labResult;
  expect(labResult).toMatchObject({ testKey: 'estradiol', valueNum: 206, unit: 'pg/mL', range: {
    status: 'recorded', classification: 'within', context: { sex: 'F', cyclePhase: 'ovulation' },
  } });
  expect(JSON.stringify(labResult)).not.toMatch(/anckaert|e2-phase-source|phase-medians/i);
  await phase(page, 'follicular');
  await expectCard(page);
  const unchanged = await page.evaluate(id => window.VildaVault.getPatientNote(id), saved[0].id);
  expect(unchanged.labResult).toEqual(labResult);
  // Existing pinned RI is replayed without invoking today's calculation.
  await page.evaluate(() => {
    window.__phaseHistoricalCalls = 0;
    window.LabUnitConverter = { ...window.LabUnitConverter, evaluate() {
      window.__phaseHistoricalCalls++; throw new Error('History requested current E2 norms');
    } };
  });
  const chip = page.locator(`#labHistoryStrip button.lab-strip-chip[data-note-id="${saved[0].id}"]`);
  await chip.click();
  await expect(page.locator('#labHistoryStrip .lab-strip-detail-range')).toContainText('104–398');
  await expect(page.locator('#labHistoryStrip')).not.toContainText('Anckaert');
  expect(await page.evaluate(() => window.__phaseHistoricalCalls)).toBe(0);
});
