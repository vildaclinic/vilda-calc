import { expect, test } from '../support/test-czas.mjs';

// Independent fictional accounts/patients. D3 is a local fact about the current
// E2 result; published P50 must not change the RI, phase summary or history.
test.use({ serviceWorkers: 'block', reducedMotion: 'reduce' });
test.setTimeout(150_000);

const host = page => page.locator('#labE2D3');
const card = page => host(page).locator('.vilda-e2-d3');
const day = page => card(page).locator('[data-e2-d3="day"]');
const median = page => card(page).locator('[data-e2-d3="median"]');
const plot = page => card(page).locator('[data-e2-d3="plot"]');
const sources = page => card(page).locator('[data-e2-d3="sources"]');
const curve = page => card(page).locator('[data-e2-d3-curve="source"]');
const patientPoint = page => card(page).locator('[data-e2-d3-marker="patient"]');
const overflowPoint = page => card(page).locator('[data-e2-d3-marker="overflow"]');
const phaseCard = page => page.locator('#labE2PhaseSource');
const variants = page => page.locator('#labRangeBlock [data-reference-variants="estradiol"] [data-variant-id]');

async function loadPatient(page, { age = 30, months = 0, sex = 'F', gnrhaStatus = '' } = {}) {
  const id = await page.evaluate(async ({ age, months, sex, gnrhaStatus }) => {
    const user = { name: 'Fikcyjna Osoba E2 D3', sex, age, ageMonths: months };
    const saved = await window.VildaVault.savePatient({ name: user.name, user,
      puberty: gnrhaStatus ? { gnrhaStatus } : {} }, { dedup: false });
    window._vildaCurrentPatientId = saved.patientId;
    sessionStorage.setItem('vildaCurrentPatientId', saved.patientId);
    if (!window.VildaPersistence.writeShared(user, { force: true })) throw new Error('Cannot load fictional E2 D3 patient');
    document.dispatchEvent(new CustomEvent('vilda:patient-loaded', { detail: { patientId: saved.patientId } }));
    return saved.patientId;
  }, { age, months, sex, gnrhaStatus });
  await expect.poll(() => page.evaluate(id => window.VildaPubertySource.kontekstPacjenta(id).status, id)).toBe('ready');
  return id;
}

async function prepare(page, width = 1440) {
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
  await page.evaluate(() => window.VildaVault.createUser('E2e#FictionalEstradiolD3!2026', {
    label: 'Fikcyjny sejf odniesienia E2 D3', iterations: 10000,
  }));
  await page.reload({ waitUntil: 'load' });
  await ready(page);
  const consent = page.locator('#consent-decline');
  if (await consent.isVisible()) await consent.click();
  return loadPatient(page);
}

async function ready(page) {
  await page.waitForFunction(() => window.VildaVault?.isUnlocked() && window.VildaE2D3Runtime
    && !document.documentElement.classList.contains('vilda-auth-locked'));
}

async function choose(page, raw = '65.4', analyte = 'estradiol') {
  await page.locator('#labSubstance').fill(analyte === 'estradiol' ? 'Estradiol' : analyte.toUpperCase());
  await page.locator(`#labSubstanceDropdown [data-id="${analyte}"]`).click();
  const unit = analyte === 'estradiol' ? 'pg/mL' : 'IU/L';
  await page.locator('#labUnit').selectOption(unit);
  await page.locator('#labUnitTarget').selectOption(unit);
  await page.locator('#labValue').fill(raw);
}

async function openEditor(page) {
  if (await page.locator('#labPatientOverride').isHidden()) await page.locator('#labPatientToggle').click();
}

async function phase(page, value) {
  await openEditor(page);
  await page.locator('#labOverrideCycle').selectOption(value);
}

async function expectSource(page, value = 56.336) {
  await expect(host(page)).toBeVisible();
  await expect.poll(async () => Number(await median(page).getAttribute('data-source-value'))).toBeCloseTo(value, 10);
  await expect(median(page)).toHaveAttribute('data-source-unit', 'pg/mL');
  await expect(card(page)).toContainText('Grisendi');
  await expect(card(page)).toContainText('3. dniu cyklu');
  await expect(curve(page)).toHaveCount(1);
}

async function expectNoPatientPoint(page) {
  await expect(patientPoint(page)).toHaveCount(0);
  await expect(overflowPoint(page)).toHaveCount(0);
}

async function expectReset(page) {
  await expect(day(page)).toHaveValue('unknown');
  await expectNoPatientPoint(page);
}

async function confirmDay3(page) {
  await expect(host(page)).toBeVisible();
  await day(page).selectOption('day3');
  await expect(plot(page)).toHaveAttribute('open', '');
  await expect(patientPoint(page)).toHaveCount(1);
}

async function expectCleared(page) {
  await expect(host(page)).toBeHidden();
  await expect(host(page).locator('[data-source-value], [data-e2-d3-marker]')).toHaveCount(0);
}

async function laboratoryFacts(page) {
  return page.locator('#labResultStatus, #labResultSourceLine, #labRangeBlock').evaluateAll(elements =>
    elements.map(element => ({ id: element.id, text: element.textContent,
      scales: [...element.querySelectorAll('.lab-range-scale')].map(scale => scale.getAttribute('style')),
    })));
}

async function lifeGeometry(page) {
  return page.locator('#labHormoneLifespan [data-female-stable-line="e2"]')
    .evaluateAll(paths => paths.map(path => ({ d: path.getAttribute('d'), divisor: path.dataset.divisor,
      ceiling: path.dataset.ceiling, viewBox: path.ownerSVGElement.getAttribute('viewBox') })));
}

async function expectFits(page) {
  expect(await host(page).evaluate(node => node.scrollWidth <= node.clientWidth + 1)).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
}

for (const width of [1440, 320, 390]) test(`E2 D3 is optional and preserves RI, phase and life geometry at ${width}px`, async ({ page }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await prepare(page, width);
  await choose(page);
  await expect(page.locator('#labResultBig .lab-result-big-value')).toHaveText('65,4');
  await expect(page.locator('#labPatientOverride')).toBeHidden();
  await expect(variants(page)).toHaveCount(4);
  await expect(phaseCard(page)).toBeHidden();
  await expectSource(page);
  await expectReset(page);
  await expect(plot(page)).not.toHaveAttribute('open');
  await expect(day(page)).not.toHaveAttribute('required');

  const shared = await page.evaluate(() => window.VildaPersistence.readShared());
  const originalGeometry = await lifeGeometry(page);
  expect(originalGeometry.length).toBeGreaterThan(0);
  const originalCurve = await curve(page).getAttribute('d');
  await confirmDay3(page);
  // D3 does not silently choose a phase or resolve four neutral RI variants.
  await expect(variants(page)).toHaveCount(4);
  await expect(page.locator('#labOverrideCycle')).toHaveValue('');
  await expect(phaseCard(page)).toBeHidden();
  await expect(card(page).locator('[data-e2-d3-marker="source"]')).toHaveCount(1);
  expect(await patientPoint(page).getAttribute('cy')).not.toBe(await card(page).locator('[data-e2-d3-marker="source"]').getAttribute('cy'));
  expect(await lifeGeometry(page)).toEqual(originalGeometry);
  expect(await curve(page).getAttribute('d')).toBe(originalCurve);

  await phase(page, 'follicular');
  await expectReset(page);
  await expect(page.locator('#labResultStatus')).toContainText('w zakresie normy');
  await expect(page.locator('#labResultSourceLine')).toContainText('19,1–79 pg/mL');
  await expect(phaseCard(page).locator('[data-e2-phase="median"]')).toHaveAttribute('data-source-value', '198');
  const before = await laboratoryFacts(page);
  await confirmDay3(page);
  expect(await laboratoryFacts(page)).toEqual(before);
  expect(await lifeGeometry(page)).toEqual(originalGeometry);
  await expect(card(page)).not.toContainText(/w zakresie normy|powyżej mediany|poniżej mediany|\bSDS\s*[:=]|\bMoM\b/i);
  await expectFits(page);
  await host(page).screenshot({ path: test.info().outputPath(`e2-d3-${width}-confirmed.png`) });

  // The displayed target is not a new sample: keep D3 and the source unit.
  for (const unit of ['pmol/L', 'pg/mL']) {
    await page.locator('#labUnitTarget').selectOption(unit);
    await expect(day(page)).toHaveValue('day3');
    await expect(patientPoint(page)).toHaveCount(1);
    await expectSource(page);
    await expect(page.locator('#labResultStatus')).toContainText('w zakresie normy');
    if (unit === 'pg/mL') expect(await laboratoryFacts(page)).toEqual(before);
    else await expect(page.locator('#labResultSourceLine')).toContainText('70–290 pmol/L');
  }
  await sources(page).locator(':scope > summary').click();
  await expect(sources(page)).toHaveAttribute('open', '');
  await expect(sources(page)).toContainText('ADVIA Centaur');
  await expect(sources(page)).toContainText('192');
  await expectFits(page);
  await day(page).focus();
  await day(page).evaluate(node => { window.__fictionalE2D3Select = node; });
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await expect(day(page)).toBeFocused();
  await expect(day(page)).toHaveValue('day3');
  await expect(sources(page)).toHaveAttribute('open', '');
  expect(await day(page).evaluate(node => node === window.__fictionalE2D3Select)).toBe(true);
  expect(await page.evaluate(() => window.VildaPersistence.readShared())).toEqual(shared);
  expect(errors).toEqual([]);
});

test('E2 D3 preserves inequalities, converts the patient once and keeps its fixed source scale', async ({ page }) => {
  await prepare(page, 320);
  await choose(page);
  await phase(page, 'follicular');
  await confirmDay3(page);
  const originalCurve = await curve(page).getAttribute('d');
  await page.locator('#labUnitTarget').selectOption('pmol/L');
  for (const [raw, visible] of [['<10', '<36,7'], ['>10', '>36,7'], ['<LOD', '<LOD'], ['<LOQ', '<LOQ']]) {
    await page.locator('#labValue').fill(raw);
    await expectReset(page);
    await expectSource(page);
    await day(page).selectOption('day3');
    await expectSource(page);
    await expectNoPatientPoint(page);
    await expect(page.locator('#labValue')).toHaveValue(raw);
    await expect(page.locator('#labResultBig .lab-result-big-value')).toHaveText(visible);
    await expect(page.locator('#labRangeBlock .lab-range-marker')).toHaveCount(0);
    await expect(page.locator('#labResultStatus')).toBeEmpty();
    expect(await curve(page).getAttribute('d')).toBe(originalCurve);
  }
  await page.locator('#labUnit').selectOption('ng/L');
  await page.locator('#labValue').fill('<LOD');
  await expectReset(page);
  await expectSource(page);
  await day(page).selectOption('day3');
  await expectSource(page);
  await expectNoPatientPoint(page);
  await expect(page.locator('#labResultBig .lab-result-big-value')).toHaveText('<LOD');
  await expect(page.locator('#labResultBig .lab-result-big-unit')).toHaveText('ng/L');
  await page.locator('#labUnit').selectOption('pg/mL');
  await page.locator('#labValue').fill('206');
  await expectReset(page);
  await day(page).selectOption('day3');
  await expect(patientPoint(page)).toHaveCount(0);
  await expect(overflowPoint(page)).toHaveCount(1);
  await expect(card(page).locator('svg')).toContainText('206');
  await expect(card(page).locator('[data-e2-d3-axis="y"][data-axis-value="100"]')).toHaveCount(1);
  expect(await curve(page).getAttribute('d')).toBe(originalCurve);
  await expect(page.locator('#labResultStatus')).toContainText('powyżej normy');

  await page.locator('#labValue').fill('0.0001');
  await day(page).selectOption('day3');
  await expect(card(page).locator('[data-e2-d3="patient-number"]')).toContainText('0,0001');
  await page.locator('#labValue').fill('100.0001');
  await day(page).selectOption('day3');
  await expect(card(page).locator('svg')).toContainText('100,0001');

  // 240.0834 pmol/L is exactly the converter's 65.4 pg/mL example. The
  // two SVG y positions must match across source-unit changes, without a
  // second application of 3.671 or moving the median onto the patient point.
  await page.locator('#labValue').fill('65.4');
  await day(page).selectOption('day3');
  const pgY = Number(await patientPoint(page).getAttribute('cy'));
  await page.locator('#labUnit').selectOption('pmol/L');
  await expectReset(page);
  await page.locator('#labValue').fill('240.0834');
  await confirmDay3(page);
  expect(Number(await patientPoint(page).getAttribute('cy'))).toBeCloseTo(pgY, 8);
  await expectSource(page);
  expect(await curve(page).getAttribute('d')).toBe(originalCurve);
  await expectFits(page);
  for (const raw of ['', 'abc', '-1']) {
    await page.locator('#labValue').fill(raw);
    await expectNoPatientPoint(page);
  }
});

test('E2 D3 does not borrow FSH D3 or retain a previous person, sex, result or restored visit', async ({ page }) => {
  await prepare(page, 320);
  await choose(page, '7', 'fsh');
  const fshDay = page.locator('#labFshD3 [data-fsh-d3="day"]');
  await fshDay.selectOption('day3');
  await choose(page);
  await expectSource(page);
  await expectReset(page);
  await phase(page, 'follicular');
  await confirmDay3(page);
  await choose(page, '7', 'fsh');
  await expectCleared(page);
  await expect(fshDay).toHaveValue('unknown');
  await choose(page);
  await phase(page, 'follicular');
  await expectReset(page);
  await confirmDay3(page);
  await page.locator('#labOverrideSex').selectOption('M');
  await expectCleared(page);
  await page.locator('#labOverrideSex').selectOption('F');
  await expect(page.locator('#labOverrideCycle')).toHaveValue('');
  await expectSource(page);
  await expectReset(page);
  await confirmDay3(page);

  const id = await loadPatient(page);
  await expect(page.locator('#labValue')).toHaveValue('');
  await choose(page);
  await expectSource(page);
  await expectReset(page);
  await confirmDay3(page);
  await page.evaluate(id => document.dispatchEvent(new CustomEvent('vilda:patient-loaded', {
    detail: { patientId: id, source: 'pick' },
  })), id);
  await expect(page.locator('#labValue')).toHaveValue('');
  await choose(page);
  await expectReset(page);
  await confirmDay3(page);
  await page.locator('#labClearBtn').click();
  await expectNoPatientPoint(page);
  await choose(page);
  await expectReset(page);
  await confirmDay3(page);
  await page.evaluate(() => window.VildaVault.lock());
  await expectCleared(page);
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await expectCleared(page);
});

test('E2 D3 respects the complete source age interval and known reproductive/treatment exclusions', async ({ page }) => {
  await prepare(page);
  await choose(page);
  await phase(page, 'follicular');
  await confirmDay3(page);
  for (const [age, months, value] of [[18, 0, null], [18, 11, null], [19, 0, 39.984],
    [30, 6, 57.0795], [40, 0, 71.202], [43, 11, 77.02508333333333], [44, 0, null], [45, 0, null]]) {
    await page.locator('#labOverrideAge').fill(String(age));
    await page.locator('#labOverrideAgeMonths').fill(String(months));
    if (value === null) await expectCleared(page);
    else { await expectSource(page, value); await expectReset(page); }
    await expect(page.locator('#labResultBig .lab-result-big-value')).toHaveText('65,4');
  }
  await page.locator('#labOverrideAge').fill('30');
  await page.locator('#labOverrideAgeMonths').fill('0');
  await expectSource(page);
  for (const reproductive of ['pregnancy_t1', 'pregnancy_t2', 'pregnancy_t3', 'postmenopause']) {
    await phase(page, reproductive);
    await expectCleared(page);
    await expect(page.locator('#labResultBig .lab-result-big-value')).toHaveText('65,4');
  }
  // A known ovulatory phase and D3 cannot be silently reconciled. Its normal
  // RI status is still the existing converter's independent classification.
  await phase(page, 'ovulation');
  await page.locator('#labValue').fill('206');
  await expectSource(page);
  await day(page).selectOption('day3');
  await expectNoPatientPoint(page);
  await expect(card(page).locator('[data-e2-d3="state"]')).toContainText(/niespój|niezgod/i);
  await expect(page.locator('#labResultStatus')).toContainText('w zakresie normy');
  await loadPatient(page, { gnrhaStatus: 'w-trakcie' });
  await choose(page);
  await phase(page, 'follicular');
  await expectCleared(page);
  await expect(page.locator('#labResultBig .lab-result-big-value')).toHaveText('65,4');
});

test('E2 D3 stays read-only when a result is pinned and historical RI is replayed', async ({ page }) => {
  const id = await prepare(page);
  await choose(page);
  await phase(page, 'follicular');
  await confirmDay3(page);
  await page.locator('#labPinResultBtn').click();
  await expect(page.locator('#labPinOverlay')).not.toContainText('Grisendi');
  await page.locator('#labPinSave').click();
  await expect(page.locator('#labPinOverlay')).toHaveCount(0);
  const notes = await page.evaluate(id => window.VildaVault.listPatientNotesForPatient(id), id);
  expect(notes).toHaveLength(1);
  const saved = notes[0];
  expect(saved.labResult).toMatchObject({ testKey: 'estradiol', valueNum: 65.4, unit: 'pg/mL', range: {
    status: 'recorded', classification: 'within', context: { sex: 'F', cyclePhase: 'follicular' },
  } });
  expect(saved.labResult.hormoneReference).toBeUndefined();
  expect(JSON.stringify(saved.labResult)).not.toMatch(/grisendi|e2D3|e2-d3|cycleDay/i);
  await day(page).selectOption('other');
  expect((await page.evaluate(id => window.VildaVault.getPatientNote(id), saved.id)).labResult).toEqual(saved.labResult);
  await page.evaluate(() => {
    window.__e2D3HistoricalCalls = 0;
    window.LabUnitConverter = { ...window.LabUnitConverter, evaluate() {
      window.__e2D3HistoricalCalls++; throw new Error('History requested current E2 norms');
    } };
  });
  await page.locator(`#labHistoryStrip button.lab-strip-chip[data-note-id="${saved.id}"]`).click();
  await expect(page.locator('#labHistoryStrip .lab-strip-detail-range')).toContainText('19,1–79');
  await expect(page.locator('#labHistoryStrip')).not.toContainText('Grisendi');
  expect(await page.evaluate(() => window.__e2D3HistoricalCalls)).toBe(0);
  expect((await page.evaluate(id => window.VildaVault.getPatientNote(id), saved.id)).labResult).toEqual(saved.labResult);
});

test('E2 D3 reuses the main form inside the application shell without asking for the same age again', async ({ page }) => {
  await prepare(page);
  await page.goto('/app.html#/start', { waitUntil: 'load' });
  const startHandle = await page.locator('iframe.app-pane[title="Start"]').elementHandle();
  const start = await startHandle.contentFrame();
  await start.waitForFunction(() => window.VildaVault?.isUnlocked() && window.VildaPersistence && window.VildaDobAge
    && typeof window.collectUserData === 'function' && !document.documentElement.classList.contains('vilda-auth-locked'));
  // The initial restore is queued before its active flags become true.
  const restored = await start.evaluate(() => window.VildaDataImportExport.whenInitialMainSessionRestoreSettled());
  expect(restored.ready).toBe(true);
  await start.waitForFunction(() => !window.VildaPersistence.isAutosaveSuppressed() && !window.VildaPersistence.isRestoring()
    && !window.VildaDobAge.restorePending());
  // The saved patient supplies sex; the main form intentionally locks this identity field.
  await expect(start.locator('#sex')).toHaveValue('F');
  await start.locator('#age').fill('40');
  await start.locator('#ageMonths').fill('0');
  await start.locator('#ageMonths').dispatchEvent('change');
  await expect.poll(() => start.evaluate(() => {
    const shared = window.VildaPersistence.readShared();
    return { form: document.getElementById('age').value, shared: Number(shared?.age),
      restoredField: Number(shared?._vildaPersist?.byId?.age) };
  })).toEqual({ form: '40', shared: 40, restoredField: 40 });
  await page.locator('.sidebar-nav a[href="przelicznik-jednostek.html"]').click();
  const labIframe = page.locator('iframe.app-pane[title="Jednostki laboratoryjne"]');
  await expect(labIframe).toBeVisible();
  const lab = await (await labIframe.elementHandle()).contentFrame();
  await ready(lab);
  await choose(lab);
  await expectSource(lab, 71.202);
  await expect(lab.locator('#labPatientText')).toContainText('40');
  await expect(lab.locator('#labPatientOverride')).toBeHidden();
  await expectReset(lab);
  await confirmDay3(lab);
  const data = await start.evaluate(() => window.VildaPersistence.readShared());
  expect(data).toMatchObject({ sex: 'F' });
  expect(Number(data.age)).toBe(40);
  await expect(start.locator('#age')).toHaveValue('40');
});

test.describe('E2 D3 offline', () => {
  test.use({ serviceWorkers: 'allow' });
  test('production SW supplies all D3 modules after an offline reload and does not persist the day answer', async ({ page, context }) => {
    test.setTimeout(180_000);
    await prepare(page, 320);
    await page.evaluate(async () => {
      const registration = await navigator.serviceWorker.register('/service-worker-kalorii.js', { scope: '/' });
      const worker = registration.installing || registration.waiting || registration.active;
      if (!['activated', 'redundant'].includes(worker.state)) await new Promise(resolve => {
        worker.addEventListener('statechange', () => { if (['activated', 'redundant'].includes(worker.state)) resolve(); });
      });
      if (worker.state !== 'activated') throw new Error('Production SW precache did not activate');
      await navigator.serviceWorker.ready;
    });
    await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true);
    await choose(page);
    await expectSource(page);
    await confirmDay3(page);
    const resourceUrls = await page.evaluate(() => {
      const names = ['vilda_e2_d3.js', 'vilda_e2_d3_ui.js', 'vilda_e2_d3_ui.css', 'vilda_hormone_lifespan_data.js'];
      const urls = [...document.querySelectorAll('script[src], link[rel="stylesheet"][href]')]
        .map(node => node.src || node.href).map(value => new URL(value));
      return names.map(name => {
        const url = urls.find(candidate => candidate.pathname === '/' + name);
        if (!url) throw new Error('Production converter does not load ' + name);
        return url.pathname + url.search;
      });
    });
    const loaded = new Set();
    page.on('response', response => {
      const url = new URL(response.url());
      if (response.fromServiceWorker()) loaded.add(url.pathname + url.search);
    });
    await context.setOffline(true);
    await page.reload({ waitUntil: 'load' });
    await ready(page);
    expect(await page.evaluate(() => fetch('/__e2_d3_uncached_probe').then(() => false, () => true))).toBe(true);
    for (const url of resourceUrls) expect(loaded.has(url), `${url} is served by the production SW offline`).toBe(true);
    await choose(page);
    await expectSource(page);
    await expectReset(page);
    await expect(variants(page)).toHaveCount(4);
    await confirmDay3(page);
    await expectFits(page);
    await page.locator('#labValue').fill('<LOD');
    await expectReset(page);
    await day(page).selectOption('day3');
    await expectSource(page);
    await expectNoPatientPoint(page);
    await expect(page.locator('#labResultBig .lab-result-big-value')).toHaveText('<LOD');
  });
});
