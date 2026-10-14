import { expect, test } from '../support/test-czas.mjs';

// Synthetic patients only. Exercise the real converter, vault context and UI;
// the source values are the published P50 anchors, not interpolated medians.
test.use({ serviceWorkers: 'block', reducedMotion: 'reduce' });
const host = page => page.locator('#labAmhAgeReference');
const reference = page => host(page).locator('.vilda-amh-age-reference');
const point = (page, age) => reference(page).locator(`[data-amh-age="${age}"]`);
const P50 = { 45: 0.365121103, 50: 0.045923937, 55: 0.005234022 };

async function prepare(page, width = 1440) {
  await page.setViewportSize({ width, height: 1000 });
  await page.route('**/*', route => {
    const url = new URL(route.request().url());
    return url.hostname === '127.0.0.1' || /^(data|blob):$/.test(url.protocol) ? route.continue() : route.abort();
  });
  await page.addInitScript(() => {
    localStorage.setItem('vilda-terms-accepted-v1', JSON.stringify({ version: 1, acceptedAtISO: new Date().toISOString() }));
    const now = new Date();
    const iso = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    for (const state of ['shown', 'closed']) localStorage.setItem(`vilda-reminders-${state}-v1`, `${iso}|${Date.now()}`);
  });
  await page.goto('/przelicznik-jednostek.html', { waitUntil: 'load' });
  await page.evaluate(() => window.VildaSession.ensureAuthLoaded());
  await page.waitForFunction(() => Boolean(window.VildaVault));
  await page.evaluate(() => window.VildaVault.createUser('E2e#FictionalXuAmh!2026', {
    label: 'Fikcyjny sejf odniesienia Xu AMH', iterations: 10000,
  }));
  await page.reload({ waitUntil: 'load' });
  await page.waitForFunction(() => window.VildaVault?.isUnlocked() && window.VildaAmhAgeReferenceRuntime &&
    !document.documentElement.classList.contains('vilda-auth-locked'));
  const consent = page.locator('#consent-decline');
  if (await consent.isVisible()) await consent.click();
  return loadPatient(page);
}

async function loadPatient(page, { age = 47, sex = 'F', name = 'Fikcyjna Pacjentka Xu AMH' } = {}) {
  const id = await page.evaluate(async ({ age, sex, name }) => {
    const user = { name, sex, age, ageMonths: 0 };
    const saved = await window.VildaVault.savePatient({ name, user, puberty: {} }, { dedup: false });
    window._vildaCurrentPatientId = saved.patientId;
    sessionStorage.setItem('vildaCurrentPatientId', saved.patientId);
    if (!window.VildaPersistence.writeShared(user, { force: true })) throw new Error('Cannot load the fictional patient');
    document.dispatchEvent(new CustomEvent('vilda:patient-loaded', { detail: { patientId: saved.patientId } }));
    return saved.patientId;
  }, { age, sex, name });
  await expect.poll(() => page.evaluate(pid => window.VildaPubertySource.kontekstPacjenta(pid).status, id)).toBe('ready');
  return id;
}

async function choose(page, id = 'amh', value = '0.10') {
  await page.locator('#labSubstance').fill(id === 'amh' ? 'AMH' : 'Kortyzol');
  await page.locator(`#labSubstanceDropdown [data-id="${id}"]`).click();
  if (id === 'amh') {
    await page.locator('#labUnit').selectOption('ng/mL');
    await page.locator('#labUnitTarget').selectOption('ng/mL');
  }
  await page.locator('#labValue').fill(value);
}

async function expectAnchors(page, ages, unit = 'ng/mL') {
  await expect(host(page)).toBeVisible();
  await expect(reference(page).locator('[data-amh-age]')).toHaveCount(ages.length);
  for (const age of ages) {
    await expect(point(page, age)).toHaveAttribute('data-unit', unit);
    await expect.poll(async () => Number(await point(page, age).getAttribute('data-canonical-value'))).toBeCloseTo(P50[age], 12);
    await expect.poll(async () => Number(await point(page, age).getAttribute('data-value')))
      .toBeCloseTo(unit === 'pmol/L' ? P50[age] / 0.1401 : P50[age], 10);
    await expect(point(page, age)).toContainText(unit);
  }
}

for (const width of [1440, 320]) test(`Xu AMH shows two published anchors and source details for age 47 at ${width}px`, async ({ page }) => {
  await prepare(page, width);
  await choose(page);
  const shared = await page.evaluate(() => window.VildaPersistence.readShared());
  await expectAnchors(page, [45, 50]);
  await expect(reference(page)).toHaveAttribute('data-mode', 'adjacent');
  await expect(reference(page)).toContainText('Dane dotyczą kobiet przed menopauzą');
  await expect(reference(page).locator('[data-amh-age="47"]')).toHaveCount(0);
  await expect(reference(page).locator('input, select, textarea')).toHaveCount(0);
  await host(page).screenshot({ path: test.info().outputPath(`xu-amh-47-${width}px.png`) });
  expect(await host(page).evaluate(el => Boolean(el.compareDocumentPosition(document.getElementById('labHormoneLifespan')) & Node.DOCUMENT_POSITION_FOLLOWING))).toBe(true);
  const curve = page.locator('#labHormoneLifespan [data-female-stable-line="amh"]');
  const geometry = await curve.evaluateAll(paths => paths.map(path => path.getAttribute('d')));
  expect(geometry.length).toBeGreaterThan(0);
  const clinicalSource = await page.locator('#labResultSourceLine').innerText();
  const clinicalStatus = await page.locator('#labResultStatus').innerText();
  await reference(page).locator('details > summary').click();
  await expect(reference(page).locator('details')).toHaveAttribute('open', '');
  await expect(reference(page).locator('details')).toContainText('Xu');
  await expect(reference(page).locator('details')).toContainText('Kangrun');
  await expect(reference(page).locator('details')).toContainText('HS-AMH');
  await expect(reference(page).locator('a[href="https://doi.org/10.1097/CM9.0000000000004161"]')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  for (const unit of ['pmol/L', 'μg/L']) {
    await page.locator('#labUnitTarget').selectOption(unit);
    await expectAnchors(page, [45, 50], unit);
    expect(await curve.evaluateAll(paths => paths.map(path => path.getAttribute('d')))).toEqual(geometry);
  }
  await page.locator('#labUnitTarget').selectOption('ng/mL');
  await page.locator('#labUnit').selectOption('μg/L');
  await expectAnchors(page, [45, 50]);
  await page.locator('#labUnit').selectOption('ng/mL');
  await expectAnchors(page, [45, 50]);
  await expect(page.locator('#labResultSourceLine')).toHaveText(clinicalSource, { useInnerText: true });
  await expect(page.locator('#labResultStatus')).toHaveText(clinicalStatus, { useInnerText: true });
  expect(await page.evaluate(() => window.VildaPersistence.readShared())).toEqual(shared);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
});

test('Xu AMH respects reported-age intervals and labels the terminal published age without extrapolation', async ({ page }) => {
  await prepare(page);
  await choose(page);
  await page.locator('#labPatientToggle').click();
  await page.locator('#labOverrideAge').fill('45');
  await expectAnchors(page, [45, 50]);
  await expect(reference(page)).toHaveAttribute('data-mode', 'adjacent');
  await page.locator('#labOverrideAge').fill('52');
  await expectAnchors(page, [50, 55]);
  await expect(reference(page).locator('[data-amh-age="52"]')).toHaveCount(0);
  await page.locator('#labOverrideAge').fill('55');
  await expectAnchors(page, [55]);
  await expect(reference(page)).toHaveAttribute('data-mode', 'terminal-anchor');
  await expect(reference(page)).toContainText('Ostatni opublikowany punkt wieku');
  await page.locator('#labOverrideAge').fill('57');
  await expect(host(page)).toBeHidden();
  await expect(host(page).locator('[data-amh-age]')).toHaveCount(0);
  await page.locator('#labOverrideAge').fill('');
  await expectAnchors(page, [45, 50]);
});

test('Xu AMH clears stale references after invalid input, sex, analyte or patient changes and vault lock', async ({ page }) => {
  await prepare(page);
  await choose(page);
  await expectAnchors(page, [45, 50]);
  for (const invalid of ['', 'abc', '-1']) {
    await page.locator('#labValue').fill(invalid);
    await expect(host(page)).toBeHidden();
    await expect(host(page).locator('[data-amh-age]')).toHaveCount(0);
  }
  await page.locator('#labValue').fill('0.10');
  await expectAnchors(page, [45, 50]);
  await page.locator('#labPatientToggle').click();
  await page.locator('#labOverrideSex').selectOption('M');
  await expect(host(page)).toBeHidden();
  await page.locator('#labOverrideSex').selectOption('F');
  await expectAnchors(page, [45, 50]);
  await choose(page, 'cortisol', '10');
  await expect(host(page)).toBeHidden();
  await expect(host(page).locator('[data-amh-age]')).toHaveCount(0);
  await choose(page);
  await expectAnchors(page, [45, 50]);
  await loadPatient(page, { age: 52, name: 'Fikcyjna Druga Pacjentka Xu AMH' });
  await expect(page.locator('#labValue')).toHaveValue('');
  await expect(host(page)).toBeHidden();
  await expect(host(page).locator('[data-amh-age]')).toHaveCount(0);
  await page.locator('#labValue').fill('0.10');
  await expectAnchors(page, [50, 55]);
  await page.evaluate(() => window.VildaVault.lock());
  await expect(host(page)).toBeHidden();
  await expect(host(page).locator('[data-amh-age]')).toHaveCount(0);
});

test('Xu AMH exact-age runtime edge clears the displayed source for known postmenopause or unavailable context', async ({ page }) => {
  const identityKey = await prepare(page);
  await choose(page);
  const context = { analyte: 'amh', sex: 'female', ageYears: 55, ageUpperYears: 55,
    ageUpperInclusive: true, sourceStatus: 'ready', identityKey, cyclePhase: null,
    measurement: { value: 0.10, unit: 'ng/mL', operator: '=' }, displayUnit: 'ng/mL' };
  // The form supplies reported-age intervals. Exercise the distinct exact-age
  // boundary through the mounted production renderer without inventing a DOB.
  await page.evaluate(value => window.VildaAmhAgeReferenceRuntime.update(value), context);
  await expectAnchors(page, [55]);
  await expect(reference(page)).toHaveAttribute('data-mode', 'exact');
  await page.evaluate(value => window.VildaAmhAgeReferenceRuntime.update(value), { ...context, cyclePhase: 'postmenopause' });
  await expect(host(page)).toBeHidden();
  await expect(host(page).locator('[data-amh-age]')).toHaveCount(0);
  await page.evaluate(value => window.VildaAmhAgeReferenceRuntime.update(value), context);
  await expectAnchors(page, [55]);
  await page.evaluate(value => window.VildaAmhAgeReferenceRuntime.update(value), { ...context, sourceStatus: 'loading' });
  await expect(host(page)).toBeHidden();
  await expect(host(page).locator('[data-amh-age]')).toHaveCount(0);
});

test('Xu AMH preserves a censored result and its unit conversion without drawing an exact patient point', async ({ page }) => {
  const id = await prepare(page);
  await choose(page, 'amh', '<0.003');
  await expectAnchors(page, [45, 50]);
  await expect(page.locator('#labResultBig')).toContainText('<');
  await expect(page.locator('#labResultBig')).toContainText('0,003');
  await expect(page.locator('#labHormoneLifespan [data-result-point]')).toHaveCount(0);
  await expect(host(page).locator('[data-result-point]')).toHaveCount(0);
  await expect(page.locator('#labRangeBlock .lab-range-marker')).toHaveCount(0);
  await expect(page.locator('#labResultStatus')).toBeEmpty();
  await page.locator('#labPinResultBtn').click();
  await expect(page.locator('#labPinOverlay')).toContainText('<0.003');
  await page.locator('#labPinSave').click();
  await expect(page.locator('#labPinOverlay')).toHaveCount(0);
  const saved = await page.evaluate(pid => window.VildaVault.listPatientNotesForPatient(pid), id);
  expect(saved).toHaveLength(1);
  expect(saved[0].labResult.value).toBe('<0.003');
  expect(saved[0].labResult.valueNum ?? null).toBeNull();
  expect(saved[0].labResult.hormoneReference).toMatchObject({
    status: 'unavailable', reference: null,
    measurement: { raw: '<0.003', operator: '<', sourceValue: 0.003, value: null },
  });
  expect(saved[0].labResult.hormoneReference.reasonCodes).not.toContain('reference_input_mismatch');
  const series = await page.evaluate(pid => window.VildaVault.listPatientLabSeries(pid), id);
  expect(series.flatMap(item => item.points).filter(item => item.noteId === saved[0].id)).toEqual([]);
  await page.locator('#labUnitTarget').selectOption('pmol/L');
  await expectAnchors(page, [45, 50], 'pmol/L');
  await expect(page.locator('#labResultBig')).toContainText('<');
  await expect(page.locator('#labResultBig')).toContainText('pmol/L');
  await expect(page.locator('#labHormoneLifespan [data-result-point]')).toHaveCount(0);
  for (const censored of ['<LOD', '<LOQ']) {
    await page.locator('#labValue').fill(censored);
    await expectAnchors(page, [45, 50], 'pmol/L');
    await expect(page.locator('#labResultBig')).toContainText(censored);
    await expect(page.locator('#labHormoneLifespan [data-result-point]')).toHaveCount(0);
    await expect(page.locator('#labRangeBlock .lab-range-marker')).toHaveCount(0);
    await expect(page.locator('#labResultStatus')).toBeEmpty();
  }
  await page.locator('#labValue').fill('0.10');
  await expectAnchors(page, [45, 50], 'pmol/L');
  await expect(page.locator('#labResultBig')).not.toContainText('<');
  await page.evaluate(pid => window.VildaAuthUI.showPatientCard(pid), id);
  await page.locator('.vilda-patient-tab[data-tab="timeline"]').click();
  await expect(page.locator('.vilda-patient-tab-content[data-tab="timeline"]')).toContainText('<0.003');
});
