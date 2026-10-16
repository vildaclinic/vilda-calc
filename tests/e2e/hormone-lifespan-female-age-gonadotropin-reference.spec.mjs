import { readFileSync } from 'node:fs';
import { expect, test } from '../support/test-czas.mjs';
import { quickSelect, quickFill, closePatientEditor } from '../support/lab-puberty-quick.mjs';

// Fictional current patients drive the real converter, patient source, parser,
// clinical assessment and chart; expected medians come from the supplement.
test.use({ serviceWorkers: 'block', reducedMotion: 'reduce' });
const source = JSON.parse(readFileSync(new URL('../fixtures/hormone-lifespan-gonadotropin-source-medians.json', import.meta.url), 'utf8'));
const median = (analyte, age) => source.puberty.find(row => row.sex === 'female' && row.analyte === analyte && row.ageYears === age).median;
const panel = page => page.locator('.vilda-hormone-lifespan');
const point = page => panel(page).locator('[data-patient-concentration]');
const note = page => panel(page).locator('[data-lifespan="scale-note"]');
const assessment = page => page.evaluate(() => window.VildaLabPubertyRuntime.getAssessment()?.evaluation);

async function open(page, width = 1440, age = 12) {
  await page.setViewportSize({ width, height: 1000 });
  await page.route('**/*', route => {
    const url = new URL(route.request().url());
    return url.hostname === '127.0.0.1' || /^(data|blob):$/.test(url.protocol) ? route.continue() : route.abort();
  });
  await page.addInitScript(() => {
    localStorage.setItem('vilda-terms-accepted-v1', JSON.stringify({ version: 1, acceptedAtISO: new Date().toISOString() }));
    const date = new Date();
    const iso = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    for (const key of ['vilda-reminders-shown-v1', 'vilda-reminders-closed-v1']) localStorage.setItem(key, `${iso}|${Date.now()}`);
  });
  await page.goto('/przelicznik-jednostek.html', { waitUntil: 'load' });
  await page.waitForFunction(() => window.VildaLabPubertyRuntime && window.VildaHormoneLifespanRuntime);
  const consent = page.locator('#consent-decline');
  if (await consent.isVisible()) await consent.click();
  await page.evaluate(age => {
    window.VildaPersistence.writeShared({ name: 'Fikcyjna pacjentka median LH FSH', sex: 'F', age, ageMonths: 0 }, { force: true });
    document.dispatchEvent(new CustomEvent('vilda:session-changed'));
  }, age);
}

async function choose(page, analyte, value = '2') {
  await page.locator('#labSubstance').click();
  await page.locator('#labSubstance').fill(analyte === 'estradiol' ? 'Estradiol' : analyte.toUpperCase());
  await page.locator(`#labSubstanceDropdown [data-id="${analyte}"]`).click();
  await page.locator('#labUnit').selectOption(analyte === 'estradiol' ? 'pmol/L' : 'IU/L');
  await page.locator('#labValue').fill(value);
}

async function expectPoint(page, analyte, age, value = 2) {
  await expect(point(page)).toHaveCount(1);
  await expect(point(page)).toHaveAttribute('data-profile', `madsen2022-female-${analyte}-age-6-16`);
  await expect(point(page)).toHaveAttribute('data-reference-statistic', 'median');
  await expect(point(page)).toHaveAttribute('data-label-unit', 'IU/L');
  await expect.poll(async () => Number(await point(page).getAttribute('data-value'))).toBeCloseTo(value, 8);
  await expect.poll(async () => Number(await point(page).getAttribute('data-reference-value'))).toBeCloseTo(median(analyte, age), 8);
  await expect(note(page)).not.toContainText('Uzupełnij stadium');
}

async function geometry(page, analyte) {
  return panel(page).locator('[data-lifespan="chart"]').evaluate((svg, id) => {
    const line = svg.querySelector(`[data-period-hormone="${id}"]`);
    return line && { path: line.getAttribute('d'), unit: svg.dataset.periodUnit, ceiling: svg.dataset.periodCeiling,
      transform: svg.dataset.scaleTransform, viewBox: svg.getAttribute('viewBox') };
  }, analyte);
}

for (const width of [1440, 320]) {
  test(`female age medians need no Tanner and preserve independent clinical axes and fixed geometry at ${width}px`, async ({ page }) => {
    await open(page, width);
    for (const analyte of ['lh', 'fsh']) {
      await choose(page, analyte);
      await expectPoint(page, analyte, 12);
      await expect.poll(async () => (await assessment(page)).referencePreview.byAge.status).toMatch(/^(within|above|below)$/);
      if (analyte === 'lh') expect((await assessment(page)).referencePreview.byStage.status).toBe('unavailable');
      await panel(page).locator('[data-view="puberty"]').click();
      await expectPoint(page, analyte, 12);
      const original = await geometry(page, analyte);
      expect(original).toMatchObject({ unit: 'IU/L', ceiling: '8', transform: 'linear' });
      // Changing the result cannot alter the educational source line or scale.
      for (const value of ['0', '2', '1000', '<2', '']) {
        await page.locator('#labValue').fill(value);
        if (!value || value.startsWith('<')) await expect(point(page)).toHaveCount(0);
        else {
          await expectPoint(page, analyte, 12, Number(value));
          if (value === '1000') await expect(point(page).locator('[data-result-overflow]')).toHaveCount(1);
        }
        await expect.poll(() => geometry(page, analyte)).toEqual(original);
      }
      await page.locator('#labValue').fill('2');
      await quickSelect(page, 'Kind', 'Th');
      await quickSelect(page, 'Stage', '3');
      await closePatientEditor(page);
      await expectPoint(page, analyte, 12);
      await expect.poll(async () => (await assessment(page)).referencePreview.byStage.status).toMatch(/^(within|above|below)$/);
      await expect(page.locator('#labPubertyAssessment [data-comparison="age"] .vilda-lab-axis')).toHaveCount(1);
      await expect(page.locator('#labPubertyAssessment [data-comparison="stage"] .vilda-lab-axis')).toHaveCount(1);
      await expect.poll(() => geometry(page, analyte)).toEqual(original);
      await expect(panel(page).locator('input, select, textarea')).toHaveCount(0);
      await panel(page).locator('[data-view="mini"]').click();
      // The ordinary female infant view remains relative: never attach a
      // concentration point merely because the age engine now has a median.
      await expect(point(page)).toHaveCount(0);
      await panel(page).locator('[data-view="puberty"]').click();
      await expectPoint(page, analyte, 12);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    await panel(page).screenshot({ path: test.info().outputPath(`female-age-madsen-${width}.png`) });
  });
}

test('age-only FSH reference stays the same when current Th changes and a reported age sixteen does not extrapolate', async ({ page }) => {
  await open(page, 1440, 9);
  await choose(page, 'fsh');
  await expectPoint(page, 'fsh', 9);
  for (const stage of ['1', '2', '5', '']) {
    await quickSelect(page, 'Kind', 'Th');
    await quickSelect(page, 'Stage', stage);
    await closePatientEditor(page);
    await expectPoint(page, 'fsh', 9);
  }
  await quickFill(page, 'AgeYears', '15');
  await closePatientEditor(page);
  await expectPoint(page, 'fsh', 15);
  await quickFill(page, 'AgeYears', '16');
  await closePatientEditor(page);
  await expect(point(page)).toHaveCount(0);
  await expect(note(page)).toContainText('przedział wieku');
  await quickFill(page, 'AgeYears', '17');
  await closePatientEditor(page);
  await expect(point(page)).toHaveCount(0);
  await expect(note(page)).toContainText('brak wartości odniesienia');
});

test('known pregnancy selected for E2 blocks both age references, survives same-person refresh and cannot leak to a new patient', async ({ page }) => {
  await open(page, 320);
  await choose(page, 'lh');
  await expectPoint(page, 'lh', 12);
  await choose(page, 'estradiol', '200');
  await page.locator('#labPatientToggle').click();
  await page.locator('#labOverrideCycle').selectOption('pregnancy_t1');
  await expect(page.locator('#labOverrideCycle')).toHaveValue('pregnancy_t1');
  for (const analyte of ['lh', 'fsh']) {
    await choose(page, analyte);
    const clinical = await assessment(page);
    await expect(point(page)).toHaveCount(0);
    await expect(note(page)).toContainText('Dla tego kontekstu badania nie nanosimy wyniku');
    // The conservative educational-source gate does not replace or
    // manufacture a pregnancy-specific laboratory reference.
    expect(clinical.referencePreview.byAge.status).toMatch(/^(within|above|below)$/);
    await page.evaluate(() => document.dispatchEvent(new CustomEvent('vilda:session-changed')));
    await expect(point(page)).toHaveCount(0);
    expect(await assessment(page)).toEqual(clinical);
  }
  await page.evaluate(() => {
    const id = 'fictional-new-patient-female-age-gonadotropins';
    window._vildaCurrentPatientId = id;
    sessionStorage.setItem('vildaCurrentPatientId', id);
    document.dispatchEvent(new CustomEvent('vilda:patient-loaded', { detail: { patientId: id } }));
  });
  await expect(page.locator('#labOverrideCycle')).toHaveValue('');
  await expect(page.locator('#labValue')).toHaveValue('');
  await expect(point(page)).toHaveCount(0);
  await page.evaluate(() => {
    window._vildaCurrentPatientId = null;
    sessionStorage.removeItem('vildaCurrentPatientId');
    window.VildaPersistence.writeShared({ name: 'Fikcyjna nowa pacjentka bez znanego kontekstu ciąży', sex: 'F', age: 12, ageMonths: 0 }, { force: true });
    document.dispatchEvent(new CustomEvent('vilda:patient-loaded', { detail: { patientId: null } }));
  });
  // Unknown is sufficient for this limited educational age comparison; it is
  // neither an assertion that pregnancy is absent nor a new mandatory field.
  for (const analyte of ['lh', 'fsh']) {
    await choose(page, analyte);
    await expectPoint(page, analyte, 12);
  }
});
