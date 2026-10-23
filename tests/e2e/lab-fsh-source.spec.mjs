import { expect, test } from '../support/test-czas.mjs';
import { quickSelect, quickFill, closePatientEditor } from '../support/lab-puberty-quick.mjs';
import { czekajNaOdtworzenieSesji } from '../support/sesja-czekanie.mjs';

// Fictional patients only. Manufacturer table medians remain separate from
// clinical Mayo RI, exact-age reference profiles and the daily Stricker curves.
test.use({ serviceWorkers: 'block', reducedMotion: 'reduce' });
test.setTimeout(150_000);
const host = page => page.locator('#labFshSource');
const card = page => host(page).locator('.vilda-fsh-source');
const median = page => card(page).locator('[data-fsh-source="median"]');
const details = page => card(page).locator('details');
const panel = page => page.locator('.vilda-hormone-lifespan');
const cycle = page => panel(page).locator('[data-lifespan="cycle-chart"]');
const phase = page => page.locator('#labPubertyReproductiveContext');
const assessment = page => page.locator('#labPubertyAssessment .vilda-lab-assessment');
const comparison = page => assessment(page).locator('[data-comparison="age"]');

async function loadPatient(page, { age = 30, months = 0, sex = 'F', gnrhaStatus = '' } = {}) {
  const id = await page.evaluate(async ({ age, months, sex, gnrhaStatus }) => {
    const user = { name: 'Fikcyjna Osoba FSH Źródło', sex, age, ageMonths: months };
    const saved = await window.VildaVault.savePatient({ name: user.name, user,
      puberty: gnrhaStatus ? { gnrhaStatus } : {} }, { dedup: false });
    window._vildaCurrentPatientId = saved.patientId;
    sessionStorage.setItem('vildaCurrentPatientId', saved.patientId);
    if (!window.VildaPersistence.writeShared(user, { force: true })) throw new Error('Cannot load fictional FSH source patient');
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

async function prepare(page, { width = 1440, main = false, anonymous = false } = {}) {
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
  await page.goto(anonymous ? '/index.html' : '/przelicznik-jednostek.html', { waitUntil: 'load' });
  if (anonymous) {
    for (const button of [page.locator('#consent-decline'), page.getByRole('button', { name: 'Korzystaj bez logowania', exact: true })]) {
      if (await button.isVisible()) await button.click();
    }
    await czekajNaOdtworzenieSesji(page);
    await settleMain(page);
    return null;
  }
  await page.evaluate(() => window.VildaSession.ensureAuthLoaded());
  await page.waitForFunction(() => Boolean(window.VildaVault));
  await page.evaluate(() => window.VildaVault.createUser('E2e#FictionalFshSource!2026', {
    label: 'Fikcyjny sejf informacji producenta FSH', iterations: 10000,
  }));
  await page.reload({ waitUntil: 'load' });
  await page.waitForFunction(() => window.VildaVault?.isUnlocked() && window.VildaFshSourceRuntime
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
    await page.waitForFunction(() => window.VildaFshSourceRuntime && window.VildaVault?.isUnlocked());
    await expect.poll(() => page.evaluate(id => window.VildaPubertySource.kontekstPacjenta(id).status, id)).toBe('ready');
  }
  return id;
}

async function choose(page, raw = '10', analyte = 'fsh') {
  await page.locator('#labSubstance').fill(analyte === 'estradiol' ? 'Estradiol' : analyte === 'cortisol' ? 'Kortyzol' : analyte.toUpperCase());
  await page.locator(`#labSubstanceDropdown [data-id="${analyte}"]`).click();
  if (analyte === 'fsh' || analyte === 'lh') {
    await page.locator('#labUnit').selectOption('IU/L');
    await page.locator('#labUnitTarget').selectOption('IU/L');
  }
  await page.locator('#labValue').fill(raw);
}

async function expectSource(page, value = 6.9, phaseId = 'follicular') {
  await expect(host(page)).toBeVisible();
  await expect(card(page)).toHaveAttribute('data-source-id', 'roche-elecsys-fsh-2024-group-medians');
  await expect(card(page)).toHaveAttribute('data-cycle-phase', phaseId);
  await expect(median(page)).toHaveAttribute('data-source-value', String(value));
  await expect(median(page)).toHaveAttribute('data-source-unit', 'IU/L');
  await expect(median(page)).toContainText(String(value).replace('.', ','));
  await expect(card(page)).toContainText(/wiek.*nie\s*podan/i);
  await expect(card(page)).not.toContainText(/18[–-]37|poniżej mediany|powyżej mediany/i);
  await expect(card(page).locator('input, select, textarea, [data-result-point], [data-patient-concentration], [data-median-point]')).toHaveCount(0);
  await expect(panel(page).locator('[data-patient-concentration="fsh"]')).toHaveCount(0);
}

async function expectCleared(page) {
  await expect(host(page)).toBeHidden();
  await expect(card(page)).not.toHaveAttribute('data-source-id');
  await expect(median(page)).toBeEmpty();
  await expect(card(page).locator('[data-fsh-source="sources"]')).toBeEmpty();
  await expect(details(page)).not.toHaveAttribute('open');
}

async function expectRange(page, lower, upper, status) {
  await expect(comparison(page)).toHaveAttribute('data-status', status);
  await expect(comparison(page).locator('.vilda-lab-axis')).toHaveAttribute('data-range-lower', String(lower));
  await expect(comparison(page).locator('.vilda-lab-axis')).toHaveAttribute('data-range-upper', String(upper));
  await expect(comparison(page)).toHaveAttribute('data-applicability', 'source-reference');
  await expect(page.locator('#labResultStatus')).toBeEmpty();
}

async function geometry(page) {
  return panel(page).locator('[data-line="fsh"], [data-illustrative-line="fsh"]').evaluateAll(paths => paths.map(path => ({
    d: path.getAttribute('d'), divisor: path.dataset.divisor, ceiling: path.dataset.ceiling,
    viewBox: path.ownerSVGElement.getAttribute('viewBox'),
  })));
}

async function cycleShape(page) {
  return cycle(page).locator('[data-cycle-curve="fsh"]').evaluateAll(paths => paths.map(path => path.getAttribute('d')));
}

async function expectCycle(page, ceiling = 20, names = ['FSH']) {
  await expect(cycle(page)).toBeVisible();
  await expect(cycle(page)).toHaveAttribute('data-cycle-ceiling', String(ceiling));
  await expect(cycle(page)).toHaveAttribute('data-cycle-source', 'stricker2006');
  await expect(cycle(page)).toHaveAttribute('data-cycle-unit', 'IU/L');
  await expect(cycle(page)).toHaveAttribute('data-cycle-domain', '-15,14');
  await expect(cycle(page).locator('desc')).toContainText(`0–${ceiling} IU/L`);
  for (const name of names) await expect(cycle(page).locator('title')).toContainText(name);
  await expect(panel(page).locator('.vhl-cycle-note')).toContainText('szczytu LH (0)');
  const axis = await cycle(page).evaluate(svg => {
    const plot = svg.querySelector('[data-cycle-content]');
    const left = Number(plot.dataset.plotLeft), top = Number(plot.dataset.plotTop), bottom = Number(plot.dataset.plotBottom);
    return [...plot.querySelectorAll(':scope > text')].filter(node =>
      Number(node.getAttribute('x')) < left && Number(node.getAttribute('y')) >= top && Number(node.getAttribute('y')) <= bottom + 4
    ).map(node => node.textContent);
  });
  expect(axis).toEqual(ceiling === 20 ? ['0', '5', '10', '15', '20'] : ['0', '10', '20', '30', '40', '50']);
  // At 320 px the long scale label used to be crossed by the FSH legend
  // stroke. Check the rendered header geometry, independently of its layout.
  const header = await cycle(page).evaluate(svg => {
    const plot = svg.querySelector('[data-cycle-content]');
    const top = Number(plot.dataset.plotTop);
    const label = [...plot.querySelectorAll(':scope > text')].find(node => /0[–-](?:20|50) IU\/L/.test(node.textContent));
    if (!label) return { missing: true, collisions: [] };
    const box = label.getBBox();
    const collisions = [...plot.querySelectorAll(':scope > line')].filter(line => {
      const y = Number(line.getAttribute('y1'));
      return y < top && y === Number(line.getAttribute('y2')) &&
        y >= box.y && y <= box.y + box.height &&
        Number(line.getAttribute('x2')) >= box.x && Number(line.getAttribute('x1')) <= box.x + box.width;
    }).length;
    return { missing: false, collisions, left: box.x, right: box.x + box.width, width: svg.viewBox.baseVal.width };
  });
  expect(header.missing).toBe(false);
  expect(header.collisions).toBe(0);
  expect(header.left).toBeGreaterThanOrEqual(0);
  expect(header.right).toBeLessThanOrEqual(header.width);
}

async function expectFits(page) {
  expect(await host(page).evaluate(element => element.scrollWidth <= element.clientWidth + 1)).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
}

for (const width of [1440, 320, 390]) test(`FSH manufacturer information preserves Mayo RI and fixed cycle scales at ${width}px`, async ({ page }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await prepare(page, { width, main: width === 1440 });
  await choose(page);
  await expect(phase(page)).toHaveValue('unknown');
  await expect(assessment(page).locator('[data-comparison="variant"]')).toHaveCount(4);
  await expect(assessment(page).locator('.vilda-lab-axis')).toHaveCount(0);
  await expect(page.locator('#labResultStatus')).toBeEmpty();
  await expectCleared(page);
  const shared = await page.evaluate(() => window.VildaPersistence.readShared());
  const original = await geometry(page);
  expect(original.length).toBeGreaterThan(0);
  await expectCycle(page);
  const cycleOriginal = await cycleShape(page);
  expect(cycleOriginal).toHaveLength(1);
  for (const [context, value, lower, upper, status] of [
    ['follicular', 6.9, 2.9, 14.6, 'within'], ['ovulation', 12.3, 4.7, 23.2, 'within'], ['luteal', 3.6, 1.4, 8.9, 'above'],
  ]) {
    await phase(page).selectOption(context);
    await expectSource(page, value, context);
    await expectRange(page, lower, upper, status);
    await expect(page.locator('#labResultBig .lab-result-big-value')).toHaveText('10');
    await expect(comparison(page).locator('.vilda-lab-axis-marker')).toHaveCount(1);
    await expect.poll(() => geometry(page)).toEqual(original);
    await expect.poll(() => cycleShape(page)).toEqual(cycleOriginal);
    await expectCycle(page);
    await expectFits(page);
  }
  await phase(page).selectOption('follicular');
  await expectSource(page);
  await expect(details(page)).not.toHaveAttribute('open');
  expect(await host(page).evaluate(element => Boolean(element.compareDocumentPosition(document.getElementById('labHormoneLifespan'))
    & Node.DOCUMENT_POSITION_PRECEDING))).toBe(true);
  await host(page).screenshot({ path: test.info().outputPath(`fsh-source-${width}-closed.png`) });
  await cycle(page).screenshot({ path: test.info().outputPath(`fsh-cycle20-${width}.png`) });
  await details(page).locator('summary').click();
  await expect(details(page)).toContainText('Roche Elecsys FSH');
  await expect(details(page)).toContainText(/2024-06.*V4\.0/);
  await expect(details(page)).toContainText('376');
  await expect(details(page).locator('a[href^="https://elabdoc-prod.roche.com/"]')).toBeVisible();
  await expectFits(page);
  await host(page).screenshot({ path: test.info().outputPath(`fsh-source-${width}-open.png`) });
  // A second hormone must not silently restore the old paired scale unless
  // that hormone is LH. The chosen scale also survives native fullscreen.
  await panel(page).locator('[data-hormone="e2"]').click();
  await expectCycle(page);
  await expect.poll(() => cycleShape(page)).toEqual(cycleOriginal);
  await panel(page).locator('[data-hormone="e2"]').click();
  await panel(page).locator('[data-hormone="lh"]').click();
  await expectCycle(page, 50, ['LH', 'FSH']);
  await panel(page).locator('[data-hormone="fsh"]').click();
  await expectCycle(page, 50, ['LH']);
  await expectCleared(page);
  await panel(page).locator('[data-hormone="fsh"]').click();
  await panel(page).locator('[data-hormone="lh"]').click();
  await expectCycle(page);
  await expectSource(page);
  await panel(page).locator('.vhl-expand').click();
  await expect(page.locator('dialog.vhl-fullscreen-dialog')).toBeVisible();
  await expectCycle(page);
  await panel(page).locator('[data-hormone="lh"]').click();
  await expectCycle(page, 50, ['LH', 'FSH']);
  await panel(page).locator('[data-hormone="lh"]').click();
  await expectCycle(page);
  await page.keyboard.press('Escape');
  await expect(page.locator('dialog.vhl-fullscreen-dialog')).toHaveCount(0);
  await expectCycle(page);
  for (const raw of ['0', '10000', '<5', '10']) {
    await page.locator('#labValue').fill(raw);
    await expectSource(page);
    await expectCycle(page);
    await expect.poll(() => cycleShape(page)).toEqual(cycleOriginal);
    await expect.poll(() => geometry(page)).toEqual(original);
  }
  for (const unit of ['mIU/mL', 'IU/L']) {
    await page.locator('#labUnitTarget').selectOption(unit);
    await expectSource(page);
    await expect(page.locator('#labResultBig .lab-result-big-value')).toHaveText('10');
    await expect(page.locator('#labResultBig .lab-result-big-unit')).toHaveText(unit);
    await expectCycle(page);
  }
  await quickFill(page, 'AgeYears', '55');
  await quickFill(page, 'AgeMonths', '0');
  await closePatientEditor(page);
  await phase(page).selectOption('postmenopause');
  await page.locator('#labValue').fill('67');
  await expectSource(page, 67, 'postmenopause');
  await expectRange(page, 16, 157, 'within');
  await expectFits(page);
  expect(await page.evaluate(() => window.VildaPersistence.readShared())).toEqual(shared);
  expect(errors).toEqual([]);
});

test('FSH source follows typed cycle context and clears after incompatible context, person changes or vault lock', async ({ page }) => {
  await prepare(page, { width: 320 });
  await choose(page);
  // E2's separate local selector is not the FSH Cykl / menopauza control.
  await choose(page, '100', 'estradiol');
  await page.locator('#labPatientToggle').click();
  await page.locator('#labOverrideCycle').selectOption('ovulation');
  await choose(page);
  await expect(phase(page)).toHaveValue('unknown');
  await expectCleared(page);
  await phase(page).selectOption('follicular');
  await expectSource(page);
  for (const view of ['mini', 'puberty']) {
    await panel(page).locator(`[data-view="${view}"]`).click();
    await expectCleared(page);
    await panel(page).locator('[data-view="life"]').click();
    await expectSource(page);
  }
  await panel(page).locator('[data-hormone="fsh"]').click();
  await expectCleared(page);
  await panel(page).locator('[data-hormone="fsh"]').click();
  await expectSource(page);
  await panel(page).locator('.vhl-compare-toggle').click();
  await expectCleared(page);
  await panel(page).locator('[data-view="life"]').click();
  await expectSource(page);
  await quickFill(page, 'AgeYears', '10');
  await quickFill(page, 'AgeMonths', '0');
  await closePatientEditor(page);
  await expectCleared(page);
  await quickFill(page, 'AgeYears', '30');
  await closePatientEditor(page);
  await phase(page).selectOption('follicular');
  await expectSource(page);
  await quickSelect(page, 'Sex', 'M');
  await expectCleared(page);
  await quickSelect(page, 'Sex', 'F');
  await closePatientEditor(page);
  await expect(phase(page)).toHaveValue('unknown');
  await expectCleared(page);
  await phase(page).selectOption('luteal');
  await expectSource(page, 3.6, 'luteal');
  for (const raw of ['', 'abc', '-1']) {
    await page.locator('#labValue').fill(raw);
    await expectCleared(page);
  }
  await page.locator('#labValue').fill('10');
  await expectSource(page, 3.6, 'luteal');
  await choose(page, '100', 'cortisol');
  await expectCleared(page);
  await choose(page);
  await phase(page).selectOption('follicular');
  await expectSource(page);
  await loadPatient(page, { age: 55 });
  await expect(page.locator('#labValue')).toHaveValue('');
  await expect(phase(page)).toHaveValue('unknown');
  await expectCleared(page);
  await choose(page, '67');
  await phase(page).selectOption('postmenopause');
  await expectSource(page, 67, 'postmenopause');
  await loadPatient(page, { gnrhaStatus: 'w-trakcie' });
  await choose(page);
  await phase(page).selectOption('follicular');
  await expect.poll(() => page.evaluate(() => window.VildaLabPubertyRuntime.getAssessment().evaluation.input.treatment.gnrha)).toBe('yes');
  await expectCleared(page);
  await loadPatient(page);
  await choose(page);
  await phase(page).selectOption('follicular');
  await expectSource(page);
  await page.evaluate(() => window.VildaVault.lock());
  await expect(host(page)).toBeHidden();
  await expect(page.locator('[data-source-id="roche-elecsys-fsh-2024-group-medians"], #labFshSource [data-source-value]')).toHaveCount(0);
  await page.evaluate(() => document.querySelector('#labHormoneLifespan [data-view="life"]')?.click());
  await expect(host(page)).toBeHidden();
});

test('FSH source excludes persisted anonymous current GnRHa without lending that fact to a named patient', async ({ page }) => {
  await prepare(page, { anonymous: true });
  async function editCurrentMain(status) {
    if (!page.url().endsWith('/index.html')) await page.goto('/index.html', { waitUntil: 'load' });
    await czekajNaOdtworzenieSesji(page);
    await settleMain(page);
    await expect(page.locator('#name')).toHaveValue('');
    expect(await page.evaluate(() => window._vildaCurrentPatientId || sessionStorage.getItem('vildaCurrentPatientId') || '')).toBe('');
    await page.locator('#sex').selectOption('F');
    await page.locator('#age').fill('30');
    await page.locator('#ageMonths').fill('0');
    await page.locator('#ageMonths').dispatchEvent('change');
    if (!await page.locator('#tannerStageWrap').isVisible()) await page.locator('#tannerToggleBtn').click();
    if (!await page.locator('#pubertyOptionalDetails').evaluate(element => element.open)) {
      await page.locator('#pubertyOptionalDetails > summary').click();
    }
    await page.locator('#pubertyGnrhaStatus').selectOption(status);
    await settleMain(page);
    // The fact is entered through the visible main form. Flush the real
    // persistence path before navigating, rather than manufacturing its data.
    await page.evaluate(() => {
      window.vildaPersistFlushNow?.({ force: true });
      window.VildaDataImportExport.saveMainSessionNow();
    });
    await expect.poll(() => page.evaluate(() => window.VildaPersistence.readMainSession()?.puberty?.gnrhaStatus || '')).toBe(status);
    await expect.poll(() => page.evaluate(() => {
      const user = window.VildaPersistence.readShared();
      return { sex: user.sex, age: Number(user.age), months: Number(user.ageMonths) };
    })).toEqual({ sex: 'F', age: 30, months: 0 });
  }
  async function returnToFsh() {
    await page.goto('/przelicznik-jednostek.html', { waitUntil: 'load' });
    await page.waitForFunction(() => window.VildaFshSourceRuntime && window.VildaLabPubertyRuntime);
    await choose(page);
    await phase(page).selectOption('follicular');
    await expectRange(page, 2.9, 14.6, 'within');
    await expect(page.locator('#labResultBig .lab-result-big-value')).toHaveText('10');
    await expect(comparison(page).locator('.vilda-lab-axis-marker')).toHaveCount(1);
  }

  await editCurrentMain('w-trakcie');
  await returnToFsh();
  await expectCleared(page);
  await editCurrentMain('');
  await returnToFsh();
  await expectSource(page);
  await editCurrentMain('w-trakcie');
  await returnToFsh();
  await expectCleared(page);

  // A separate fictional vault identity must not inherit the anonymous main
  // session's positive therapy fact, even at the same sex and age.
  await page.evaluate(() => window.VildaSession.ensureAuthLoaded());
  await page.waitForFunction(() => Boolean(window.VildaVault));
  await page.evaluate(() => window.VildaVault.createUser('E2e#FictionalFshSource!2026', {
    label: 'Fikcyjny sejf rozdzielenia kontekstów FSH', iterations: 10000,
  }));
  await page.reload({ waitUntil: 'load' });
  await page.waitForFunction(() => window.VildaVault?.isUnlocked() && window.VildaFshSourceRuntime
    && !document.documentElement.classList.contains('vilda-auth-locked'));
  await loadPatient(page);
  await choose(page);
  await phase(page).selectOption('follicular');
  await expectSource(page);
  await expectRange(page, 2.9, 14.6, 'within');
});

test('FSH inequalities retain existing Mayo comparisons and saved assessments stay independent of manufacturer medians', async ({ page }) => {
  const id = await prepare(page, { width: 390 });
  await choose(page);
  await phase(page).selectOption('follicular');
  await expectSource(page);
  const original = await cycleShape(page);
  for (const [raw, status] of [['<5', 'indeterminate'], ['<1', 'below'], ['<LOD', 'unavailable'], ['<LOQ', 'unavailable']]) {
    await page.locator('#labValue').fill(raw);
    await expectSource(page);
    await expect(page.locator('#labResultBig .lab-result-big-value')).toHaveText(raw);
    await expect(assessment(page).locator('.vilda-lab-axis-marker')).toHaveCount(0);
    if (status === 'unavailable') await expect(assessment(page).locator('[data-comparison="age"][data-status="within"], [data-comparison="age"][data-status="below"], [data-comparison="age"][data-status="above"]')).toHaveCount(0);
    else await expect(comparison(page)).toHaveAttribute('data-status', status);
    await expect(page.locator('#labResultStatus')).toBeEmpty();
    await expectCycle(page);
    await expect.poll(() => cycleShape(page)).toEqual(original);
    for (const unit of ['mIU/mL', 'IU/L']) {
      await page.locator('#labUnitTarget').selectOption(unit);
      await expect(page.locator('#labResultBig .lab-result-big-value')).toHaveText(raw);
      await expect(page.locator('#labResultBig .lab-result-big-unit')).toHaveText(unit);
      await expect(page.locator('#labResultsBody .lab-value')).toHaveText([raw]);
    }
  }
  await page.locator('#labValue').fill('10');
  await expectRange(page, 2.9, 14.6, 'within');
  const before = await page.evaluate(() => window.VildaLabPubertyRuntime.getAssessment().evaluation);
  await page.locator('#labPinResultBtn').click();
  const today = await page.evaluate(() => {
    const date = new Date();
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  });
  await expect(page.locator('#labPinDate')).toHaveValue(today);
  await expect(page.locator('#labPinOverlay')).not.toContainText('Mediana w tabeli producenta');
  await page.locator('#labPinSave').click();
  await expect(page.locator('#labPinOverlay')).toHaveCount(0);
  const notes = await page.evaluate(id => window.VildaVault.listPatientNotesForPatient(id), id);
  expect(notes).toHaveLength(1);
  const saved = notes[0];
  expect(saved.labResult).toMatchObject({ testKey: 'fsh', valueNum: 10, unit: 'IU/L' });
  expect(saved.labResult.assessment.evaluation).toEqual(before);
  expect(JSON.stringify(saved.labResult)).not.toMatch(/roche-elecsys-fsh-2024-group-medians|fshSource/i);
  await phase(page).selectOption('postmenopause');
  await expectSource(page, 67, 'postmenopause');
  expect((await page.evaluate(id => window.VildaVault.getPatientNote(id), saved.id)).labResult).toEqual(saved.labResult);
  await page.evaluate(id => window.VildaAuthUI.showPatientCard(id), id);
  await page.locator('.vilda-patient-tab[data-tab="lab"]').click();
  const recorded = page.locator(`.vilda-lab-assessment-history-row[data-note-id="${saved.id}"] .vilda-lab-assessment`);
  await expect(recorded).toHaveAttribute('data-assessment-status', 'recorded');
  await expect(recorded.locator('.vilda-lab-axis')).toHaveAttribute('data-range-lower', '2.9');
  await expect(recorded.locator('.vilda-lab-axis')).toHaveAttribute('data-range-upper', '14.6');
  await expect(recorded).not.toContainText('Mediana w tabeli producenta');
  expect((await page.evaluate(id => window.VildaVault.getPatientNote(id), saved.id)).labResult).toEqual(saved.labResult);
});
