import { expect, test } from '../support/test-czas.mjs';
import { quickSelect, closePatientEditor } from '../support/lab-puberty-quick.mjs';

// Fictional patients through the real converter, parser and clinical context.
test.use({ serviceWorkers: 'block', reducedMotion: 'reduce' });
const panel = page => page.locator('.vilda-hormone-lifespan');
const dot = page => panel(page).locator('[data-patient-concentration]');
const names = { lh: 'LH', fsh: 'FSH', inhibin_b: 'Inhibina B', amh: 'AMH', testosterone_total: 'Testosteron' };

async function open(page, patient) {
  await page.route('**/*', route => {
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
  await page.waitForFunction(() => window.VildaLabPubertyRuntime && window.VildaHormoneLifespanRuntime && window.VildaHormoneLifespanReference);
  const consent = page.locator('#consent-decline');
  if (await consent.isVisible()) await consent.click();
  await page.evaluate(data => {
    window.VildaPersistence.writeShared(data, { force: true });
    document.dispatchEvent(new CustomEvent('vilda:session-changed'));
  }, patient);
}

async function choose(page, analyte) {
  // Return to the form before opening its anchored dropdown, as a user does
  // after inspecting the chart farther down the page (also in Safari).
  await page.locator('#labSubstance').click();
  await page.locator('#labSubstance').fill(names[analyte]);
  await page.locator(`#labSubstanceDropdown [data-id="${analyte}"]`).click();
}

async function expectPoint(page, value, median) {
  await expect(dot(page)).toHaveCount(1);
  await expect.poll(async () => Number(await dot(page).getAttribute('data-value'))).toBeCloseTo(value, 6);
  if (median != null) await expect.poll(async () => Number(await dot(page).getAttribute('data-median'))).toBeCloseTo(median, 4);
  const geometry = await dot(page).evaluate(group => {
    const point = group.querySelector('[data-result-point]');
    const ref = group.querySelector('[data-median-point]');
    const line = group.ownerSVGElement.querySelector(`[data-reference-line][data-profile="${group.dataset.profile}"]`);
    const px = Number(point.getAttribute('cx'));
    let lo = 0, hi = line.getTotalLength();
    for (let i = 0; i < 32; i++) {
      const mid = (lo + hi) / 2;
      if (line.getPointAtLength(mid).x < px) lo = mid; else hi = mid;
    }
    return { x: px, y: Number(point.getAttribute('cy')),
      rx: Number(ref.getAttribute('cx')), ry: Number(ref.getAttribute('cy')),
      curveY: line.getPointAtLength((lo + hi) / 2).y,
      bottom: Number(group.dataset.plotBottom), value: Number(group.dataset.value), median: Number(group.dataset.median) };
  });
  expect(Object.values(geometry).every(Number.isFinite)).toBe(true);
  expect(geometry.x).toBe(geometry.rx);
  expect(Math.abs(geometry.ry - geometry.curveY)).toBeLessThan(0.05);
  if (geometry.value === 0) expect(geometry.y).toBe(geometry.bottom);
  else expect(((geometry.bottom - geometry.y) / (geometry.bottom - geometry.ry)) / (geometry.value / geometry.median)).toBeCloseTo(1, 6);
  if (median != null && value > median) expect(geometry.y).toBeLessThan(geometry.ry);
  if (median != null && value < median) expect(geometry.y).toBeGreaterThan(geometry.ry);
}

test('female infant result shares its numeric median scale, survives zoom and disappears on deselection or invalid input', async ({ page }) => {
  await open(page, { sex: 'F', age: 0, ageMonths: 3 });
  await choose(page, 'inhibin_b');
  await quickSelect(page, 'Preterm', 'no');
  await closePatientEditor(page);
  await page.locator('#labValue').fill('80');
  await expectPoint(page, 80, 49.684);
  const profile = await dot(page).getAttribute('data-profile');
  const before = await page.evaluate(() => ({ shared: window.VildaPersistence.readShared(), assessment: window.VildaLabPubertyRuntime.getAssessment() }));
  await panel(page).locator('[data-view="mini"]').click();
  await expectPoint(page, 80, 49.684);
  await expect(dot(page)).toHaveAttribute('data-profile', profile);
  await expect(panel(page).locator('[data-reference-line="inhb"]')).toHaveCount(1);
  await panel(page).locator('[data-hormone="inhb"]').click();
  await expect(dot(page)).toHaveCount(0);
  await panel(page).locator('[data-hormone="inhb"]').click();
  await expectPoint(page, 80, 49.684);
  expect(await page.evaluate(() => ({ shared: window.VildaPersistence.readShared(), assessment: window.VildaLabPubertyRuntime.getAssessment() }))).toEqual(before);
  for (const value of ['', '<80', 'abc']) {
    await page.locator('#labValue').fill(value);
    await expect(dot(page)).toHaveCount(0);
  }
  await page.locator('#labValue').fill('80');
  await expectPoint(page, 80, 49.684);
  await quickSelect(page, 'Preterm', 'yes');
  await expect(dot(page)).toHaveCount(0);
});

test('boys use numeric puberty data; changing analyte, unit and age never leaves the preceding dot', async ({ page }) => {
  await open(page, { sex: 'M', age: 12, ageMonths: 0 });
  await choose(page, 'lh');
  await page.locator('#labValue').fill('2');
  await expectPoint(page, 2, 0.6775625214);
  await page.locator('#labUnit').selectOption('mIU/mL');
  await expectPoint(page, 2, 0.6775625214);
  await panel(page).locator('[data-view="puberty"]').click();
  await expectPoint(page, 2, 0.6775625214);
  await choose(page, 'fsh');
  await page.locator('#labValue').fill('3');
  await expectPoint(page, 3, 2.0148600563);
  await page.evaluate(() => {
    window.VildaPersistence.writeShared({ sex: 'M', age: 40, ageMonths: 0 }, { force: true });
    document.dispatchEvent(new CustomEvent('vilda:session-changed'));
  });
  await expect(dot(page)).toHaveCount(0);
  await expect(panel(page)).toBeVisible();
  await page.locator('#labClearBtn').click();
  await expect(panel(page)).toBeHidden();
  await expect(dot(page)).toHaveCount(0);
});

test('legacy testosterone conversion feeds the same dot for equivalent units', async ({ page }) => {
  await open(page, { sex: 'M', age: 40, ageMonths: 0 });
  await choose(page, 'testosterone_total');
  await page.locator('#labUnit').selectOption('nmol/L');
  await page.locator('#labValue').fill('13');
  await expectPoint(page, 13);
  const median = Number(await dot(page).getAttribute('data-median'));
  expect(median).toBeGreaterThan(13);
  expect(median).toBeLessThan(13.1);
  await page.locator('#labUnit').selectOption('ng/dL');
  await page.locator('#labValue').fill('400');
  await expect(dot(page)).toHaveCount(1);
  const canonical = await page.evaluate(() => window.LabUnitConverter.convertAll({ substanceId: 'testosterone_total', value: 400, fromUnit: 'ng/dL' }));
  await expectPoint(page, canonical.siValue, median);
  await page.locator('#labValue').fill('');
  await expect(dot(page)).toHaveCount(0);
});

test('minipuberty compares quantitative medians for both sexes and retains only the current patient result', async ({ page }) => {
  await open(page, { sex: 'M', age: 0, ageMonths: 3 });
  await choose(page, 'inhibin_b');
  await quickSelect(page, 'Preterm', 'no');
  await closePatientEditor(page);
  await page.locator('#labValue').fill('300');
  await panel(page).locator('[data-view="mini"]').click();
  await panel(page).getByRole('button', { name: 'Porównaj płcie', exact: true }).click();
  await expectPoint(page, 300);
  await expect(panel(page).locator('[data-reference-line="inhb"]')).toHaveCount(2);
  const profiles = await panel(page).locator('[data-reference-line="inhb"]').evaluateAll(paths => paths.map(path => path.dataset.profile).sort());
  expect(profiles).toEqual(['busch2022-male-inhb', 'ljubicic2022-female-inhb']);
  await expect(panel(page).locator('[data-lifespan="scale-note"]')).toContainText('wspólnej skali');
  await panel(page).locator('[data-view="puberty"]').click();
  await expect(dot(page)).toHaveCount(0);
  await panel(page).locator('[data-view="mini"]').click();
  await expectPoint(page, 300);
});

for (const width of [320, 390, 1440]) {
  test(`point and labels remain visible at ${width}px and in fullscreen, including zero and a very large result`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await open(page, { sex: 'M', age: 0, ageMonths: 3 });
    await choose(page, 'inhibin_b');
    await quickSelect(page, 'Preterm', 'no');
    await closePatientEditor(page);
    await panel(page).locator('[data-view="mini"]').click();
    for (const value of ['0', '300', '100000000']) {
      await page.locator('#labValue').fill(value);
      await expectPoint(page, Number(value));
      const fit = await dot(page).evaluate(group => {
        const svg = group.ownerSVGElement;
        const point = group.querySelector('[data-result-point]');
        const box = svg.viewBox.baseVal;
        const x = Number(point.getAttribute('cx')), y = Number(point.getAttribute('cy'));
        return x >= 0 && x <= box.width && y >= 0 && y <= box.height && !/NaN|Infinity/.test(svg.innerHTML);
      });
      expect(fit).toBe(true);
    }
    await panel(page).getByRole('button', { name: 'Powiększ', exact: true }).click();
    await expect(page.locator('dialog.vhl-fullscreen-dialog')).toBeVisible();
    await expectPoint(page, 100000000);
    await page.screenshot({ path: test.info().outputPath(`patient-point-${width}.png`) });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    await panel(page).getByRole('button', { name: 'Zamknij', exact: true }).click();
    await expectPoint(page, 100000000);
  });
}
