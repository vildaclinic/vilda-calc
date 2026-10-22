import { expect, test } from '../support/test-czas.mjs';

// Fictional patients only. LiLACS is a separate description of a source cohort;
// it must not supply an exact-age median, patient point, ratio or saved norm.
test.use({ serviceWorkers: 'block', reducedMotion: 'reduce' });
const host = page => page.locator('#labAmhLilacsSource');
const card = page => host(page).locator('.vilda-amh-lilacs-source');
const chart = page => page.locator('#labHormoneLifespan');
const details = page => card(page).locator('details.vals-details');

async function settleMain(page) {
  await page.waitForFunction(() => {
    const persistence = window.VildaPersistence;
    const state = window.vildaGetPersistAutosaveCoalescingSnapshot?.();
    return persistence && !persistence.isAutosaveSuppressed() && !persistence.isRestoring()
      && !window.VildaDobAge?.restorePending?.() && state && !state.hasPendingSaveTimer
      && !state.hasPendingForceSaveTimer && !state.hasPendingElementRefreshTimer;
  });
}

async function loadPatient(page, { age = 85, months = 0, sex = 'M' } = {}) {
  const id = await page.evaluate(async ({ age, months, sex }) => {
    const user = { name: 'Fikcyjna Osoba AMH Senior', sex, age, ageMonths: months };
    const saved = await window.VildaVault.savePatient({ name: user.name, user, puberty: {} }, { dedup: false });
    window._vildaCurrentPatientId = saved.patientId;
    sessionStorage.setItem('vildaCurrentPatientId', saved.patientId);
    if (!window.VildaPersistence.writeShared(user, { force: true })) throw new Error('Cannot load fictional LiLACS patient');
    document.dispatchEvent(new CustomEvent('vilda:patient-loaded', { detail: { patientId: saved.patientId } }));
    return saved.patientId;
  }, { age, months, sex });
  await expect.poll(() => page.evaluate(id => window.VildaPubertySource.kontekstPacjenta(id).status, id)).toBe('ready');
  return id;
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
  await page.evaluate(() => window.VildaVault.createUser('E2e#FictionalLilacsAmh!2026', {
    label: 'Fikcyjny sejf informacji LiLACS AMH', iterations: 10000,
  }));
  await page.reload({ waitUntil: 'load' });
  await page.waitForFunction(() => window.VildaVault?.isUnlocked() && window.VildaAmhLilacsSourceRuntime
    && !document.documentElement.classList.contains('vilda-auth-locked'));
  const consent = page.locator('#consent-decline');
  if (await consent.isVisible()) await consent.click();
  const id = await loadPatient(page, { age: main ? 75 : 85 });
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
    await expect(page.locator('#sex')).toHaveValue('M');
    await page.locator('#age').fill('85');
    await page.locator('#ageMonths').fill('0');
    await page.locator('#ageMonths').dispatchEvent('change');
    await settleMain(page);
    await expect.poll(() => page.evaluate(() => {
      const user = window.VildaPersistence.readShared();
      return { sex: user.sex, age: Number(user.age), months: Number(user.ageMonths) };
    })).toEqual({ sex: 'M', age: 85, months: 0 });
    await page.goto('/przelicznik-jednostek.html', { waitUntil: 'load' });
    await page.waitForFunction(() => window.VildaAmhLilacsSourceRuntime && window.VildaVault?.isUnlocked());
    await expect.poll(() => page.evaluate(id => window.VildaPubertySource.kontekstPacjenta(id).status, id)).toBe('ready');
  }
  return id;
}

async function choose(page, raw = '8', analyte = 'amh') {
  await page.locator('#labSubstance').fill(analyte === 'amh' ? 'AMH' : 'Kortyzol');
  await page.locator(`#labSubstanceDropdown [data-id="${analyte}"]`).click();
  if (analyte === 'amh') {
    await page.locator('#labUnit').selectOption('pmol/L');
    await page.locator('#labUnitTarget').selectOption('pmol/L');
  }
  await page.locator('#labValue').fill(raw);
}

async function expectCard(page) {
  await expect(host(page)).toBeVisible();
  await expect(card(page)).toHaveAttribute('data-source-id', 'chong2013-lilacs-male-amh');
  await expect(card(page).locator('[data-amh-lilacs="cohort"]')).toContainText('257');
  await expect(card(page).locator('[data-amh-lilacs="cohort"]')).toContainText(/80.*90/);
  const median = card(page).locator('[data-amh-lilacs="median"]');
  await expect(median).toHaveAttribute('data-source-value', '12.1');
  await expect(median).toHaveAttribute('data-source-unit', 'pmol/L');
  await expect(median).toContainText(/12[,.]1\s*pmol\/L/);
  await expect(card(page).locator('[data-amh-lilacs="equivalent"]')).toContainText(/1[,.]7\s*ng\/ml/i);
  await expect(card(page).locator('input, select, textarea, [data-result-point], [data-patient-concentration], [data-median-point]')).toHaveCount(0);
  await expect(chart(page).locator('[data-patient-concentration="amh"], [data-result-point]')).toHaveCount(0);
  await expect(card(page)).not.toContainText(/poniżej mediany|powyżej mediany|\brazy\b|iloraz/i);
}

async function geometry(page) {
  return chart(page).locator('[data-stable-reference-line="amh"]').evaluateAll(paths => paths.map(path => ({
    path: path.getAttribute('d'), divisor: path.dataset.divisor, ceiling: path.dataset.ceiling,
    viewBox: path.ownerSVGElement.getAttribute('viewBox'),
  })));
}

async function expectFits(page) {
  expect(await host(page).evaluate(element => element.scrollWidth <= element.clientWidth + 1)).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
}

async function expectCleared(page) {
  await expect(host(page)).toBeHidden();
  await expect(card(page)).not.toHaveAttribute('data-source-id');
  await expect(card(page).locator('[data-amh-lilacs="median"], [data-amh-lilacs="sources"]')).toHaveText(['', '']);
  await expect(details(page)).not.toHaveAttribute('open');
}

for (const width of [1440, 320, 390]) test(`LiLACS describes the source cohort separately from M85's result at ${width}px`, async ({ page }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await prepare(page, { width, main: width === 1440 });
  await choose(page);
  await expectCard(page);
  await expect(page.locator('#labResultBig')).toContainText('8');
  await expect(page.locator('#labResultBig')).toContainText('pmol/L');
  await expect(details(page)).not.toHaveAttribute('open');
  expect(await host(page).evaluate(element => Boolean(element.compareDocumentPosition(document.getElementById('labHormoneLifespan'))
    & Node.DOCUMENT_POSITION_PRECEDING))).toBe(true);
  await page.locator('#labValue').fill('');
  await expectCleared(page);
  const original = await geometry(page);
  expect(original.length).toBeGreaterThan(0);
  for (const line of original) expect(line).toMatchObject({ divisor: '1335.592934', ceiling: '1.25' });
  await page.locator('#labValue').fill('8');
  await expectCard(page);
  await expect.poll(() => geometry(page)).toEqual(original);
  const shared = await page.evaluate(() => window.VildaPersistence.readShared());
  const status = await page.locator('#labResultStatus').textContent();
  const clinicalSource = await page.locator('#labResultSourceLine').textContent();
  await expectFits(page);
  await host(page).screenshot({ path: test.info().outputPath(`lilacs-${width}-closed.png`) });
  await details(page).locator('summary').click();
  await expect(details(page)).toHaveAttribute('open', '');
  await expect(details(page)).toContainText('LiLACS');
  await expect(details(page)).toContainText(/Chong|2013/);
  await expect(details(page).locator('a[href="https://journals.plos.org/plosone/article?id=10.1371/journal.pone.0070967"]')).toBeVisible();
  await expectFits(page);
  await host(page).screenshot({ path: test.info().outputPath(`lilacs-${width}-open.png`) });
  for (const unit of ['ng/mL', 'μg/L', 'pmol/L']) {
    await page.locator('#labUnitTarget').selectOption(unit);
    await expectCard(page);
    await expect.poll(() => geometry(page)).toEqual(original);
    await expectFits(page);
  }
  for (const raw of ['0', '10000', '8']) {
    await page.locator('#labValue').fill(raw);
    await expectCard(page);
    await expect.poll(() => geometry(page)).toEqual(original);
  }
  await expect(page.locator('#labResultStatus')).toHaveText(status);
  await expect(page.locator('#labResultSourceLine')).toHaveText(clinicalSource);
  expect(await page.evaluate(() => window.VildaPersistence.readShared())).toEqual(shared);
  expect(errors).toEqual([]);
});

test('LiLACS uses the whole reported age and clears stale information for context changes and vault lock', async ({ page }) => {
  test.setTimeout(120_000);
  const id = await prepare(page, { width: 320 });
  await choose(page);
  await expectCard(page);
  const original = await geometry(page);
  for (const view of ['mini', 'puberty']) {
    await chart(page).locator(`[data-view="${view}"]`).click();
    await expectCleared(page);
    await chart(page).locator('[data-view="life"]').click();
    await expectCard(page);
  }
  await chart(page).locator('[data-hormone="amh"]').click();
  await expectCleared(page);
  await chart(page).locator('[data-hormone="amh"]').click();
  await expectCard(page);
  await chart(page).locator('.vhl-compare-toggle').click();
  await expectCleared(page);
  await chart(page).locator('.vhl-compare-toggle').click();
  // AMH comparison deliberately selects minipuberty; turning comparison off
  // keeps that view until the user returns to the ordinary life diagram.
  await expectCleared(page);
  await chart(page).locator('[data-view="life"]').click();
  await expectCard(page);
  await chart(page).locator('.vhl-expand').click();
  const fullscreen = page.locator('dialog.vhl-fullscreen-dialog');
  await expect(fullscreen).toBeVisible();
  await fullscreen.locator('.vhl-compare-toggle').click();
  await page.keyboard.press('Escape');
  await expect(fullscreen).toHaveCount(0);
  await expectCleared(page);
  await chart(page).locator('.vhl-compare-toggle').click();
  await expectCleared(page);
  await chart(page).locator('[data-view="life"]').click();
  await expectCard(page);
  await chart(page).locator('.vhl-expand').click();
  await expect(fullscreen).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(fullscreen).toHaveCount(0);
  await expectCard(page);
  await expect.poll(() => geometry(page)).toEqual(original);
  await page.locator('#labPatientToggle').click();
  for (const [age, months, eligible] of [[75, 0, false], [79, 11, false], [80, 0, true], [89, 11, true], [90, 0, false], [85, 0, true]]) {
    await page.locator('#labOverrideAge').fill(String(age));
    await page.locator('#labOverrideAgeMonths').fill(String(months));
    if (eligible) await expectCard(page);
    else await expect(host(page)).toBeHidden();
    await expect.poll(() => geometry(page)).toEqual(original);
  }
  for (const raw of ['', 'abc', '-1']) {
    await page.locator('#labValue').fill(raw);
    await expectCleared(page);
  }
  await page.locator('#labValue').fill('8');
  await expectCard(page);
  await page.locator('#labOverrideSex').selectOption('F');
  await expect(host(page)).toBeHidden();
  await page.locator('#labOverrideSex').selectOption('M');
  await expectCard(page);
  await choose(page, '10', 'cortisol');
  await expect(host(page)).toBeHidden();
  await choose(page);
  await expectCard(page);
  await page.evaluate(identityKey => window.VildaAmhLilacsSourceRuntime.update({
    analyte: 'amh', sex: 'male', ageYears: 85, ageUpperYears: 85 + 1 / 12, ageUpperInclusive: false,
    sourceStatus: 'loading', identityKey, measurement: { value: 8, unit: 'pmol/L', operator: '=' }, displayUnit: 'pmol/L',
  }), id);
  await expectCleared(page);
  await page.locator('#labValue').fill('8');
  await expectCard(page);
  await loadPatient(page, { age: 75 });
  await expect(page.locator('#labValue')).toHaveValue('');
  await expect(host(page)).toBeHidden();
  await page.locator('#labValue').fill('8');
  await expect(host(page)).toBeHidden();
  await chart(page).locator('[data-view="mini"]').click();
  await chart(page).locator('[data-view="life"]').click();
  await expectCleared(page);
  await loadPatient(page);
  await expect(host(page)).toBeHidden();
  await page.locator('#labValue').fill('8');
  await expectCard(page);
  await page.evaluate(() => window.VildaVault.lock());
  // The account lock can also replace the entire clinical document with the
  // login view. Neither retained nor replaced markup may retain source facts.
  await expect(host(page)).toBeHidden();
  await expect(page.locator('[data-source-id="chong2013-lilacs-male-amh"], #labAmhLilacsSource [data-source-value]')).toHaveCount(0);
  await page.evaluate(() => document.querySelector('#labHormoneLifespan [data-view="life"]')?.click());
  await expect(host(page)).toBeHidden();
  await expect(page.locator('[data-source-id="chong2013-lilacs-male-amh"]')).toHaveCount(0);
});

test('LiLACS preserves censored results and stays outside the ordinary snapshot and historical interpretation', async ({ page }) => {
  test.setTimeout(120_000);
  const id = await prepare(page, { width: 390 });
  await choose(page);
  const original = await geometry(page);
  for (const raw of ['<0.2', '<LOD', '<LOQ']) {
    await page.locator('#labValue').fill(raw);
    await expectCard(page);
    await expect(page.locator('#labValue')).toHaveValue(raw);
    await expect(page.locator('#labResultBig')).toContainText(raw === '<0.2' ? '<' : raw);
    await expect(page.locator('#labRangeBlock .lab-range-marker')).toHaveCount(0);
    await expect(page.locator('#labResultStatus')).toBeEmpty();
    await expect.poll(() => geometry(page)).toEqual(original);
  }
  await page.locator('#labValue').fill('8');
  await expectCard(page);
  await page.locator('#labPinResultBtn').click();
  await expect(page.locator('#labPinOverlay')).not.toContainText('LiLACS');
  await page.locator('#labPinSave').click();
  await expect(page.locator('#labPinOverlay')).toHaveCount(0);
  const saved = await page.evaluate(id => window.VildaVault.listPatientNotesForPatient(id), id);
  expect(saved).toHaveLength(1);
  const snapshot = saved[0].labResult.hormoneReference;
  expect(snapshot).toMatchObject({ status: 'unavailable', reference: null,
    context: { sex: 'male', ageYears: 85 }, measurement: { raw: '8', sourceValue: 8, sourceUnit: 'pmol/L', value: null } });
  expect(JSON.stringify(saved[0].labResult)).not.toMatch(/lilacs|chong2013/i);
  const series = await page.evaluate(id => window.VildaVault.listPatientLabSeries(id), id);
  expect(series.find(row => row.testKey === 'amh').points.find(point => point.noteId === saved[0].id))
    .toMatchObject({ valueNum: 8, unit: 'pmol/L' });
  await loadPatient(page, { age: 44 });
  await choose(page, '40');
  await expect(host(page)).toBeHidden();
  await expect(chart(page).locator('[data-patient-concentration="amh"]')).toHaveAttribute('data-profile', 'tehrani2017-male-amh');
  await page.evaluate(() => {
    window.__lilacsHistoricalCalls = 0;
    window.VildaHormoneLifespanReference = { ...window.VildaHormoneLifespanReference, evaluate() {
      window.__lilacsHistoricalCalls++; throw new Error('History requested a current AMH reference');
    } };
    window.LabUnitConverter = { ...window.LabUnitConverter, evaluate() {
      window.__lilacsHistoricalCalls++; throw new Error('History requested current laboratory norms');
    } };
    // Prove both replacements are live even if the original APIs were frozen.
    for (const api of [window.VildaHormoneLifespanReference, window.LabUnitConverter]) {
      try { api.evaluate(); } catch (error) {
        if (!error.message.startsWith('History requested')) throw error;
      }
    }
    if (window.__lilacsHistoricalCalls !== 2) throw new Error('Historical read traps are not active');
    window.__lilacsHistoricalCalls = 0;
  });
  await page.evaluate(id => window.VildaAuthUI.showPatientCard(id), id);
  await page.locator('.vilda-patient-tab[data-tab="timeline"]').click();
  const timeline = page.locator('.vilda-patient-tab-content[data-tab="timeline"]');
  await expect(timeline).toContainText(/8\s*pmol\/L/);
  await expect(timeline).not.toContainText('LiLACS');
  await expect(timeline.locator('.vilda-hormone-reference')).toHaveAttribute('data-reference-status', 'unavailable');
  expect(await page.evaluate(() => window.__lilacsHistoricalCalls)).toBe(0);
  expect(await page.evaluate(id => window.VildaVault.getPatientNote(id), saved[0].id))
    .toMatchObject({ labResult: { hormoneReference: snapshot } });
});
