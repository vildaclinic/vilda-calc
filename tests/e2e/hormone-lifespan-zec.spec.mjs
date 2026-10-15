import { readFileSync } from 'node:fs';
import { expect, test } from '../support/test-czas.mjs';
import { quickSelect, quickFill, closePatientEditor } from '../support/lab-puberty-quick.mjs';

// Fictional patients use the actual converter, parser and current puberty form.
test.use({ serviceWorkers: 'block', reducedMotion: 'reduce' });
const panel = page => page.locator('.vilda-hormone-lifespan');
const dot = page => panel(page).locator('[data-patient-concentration]');
const sourceMedians = JSON.parse(readFileSync(new URL('../fixtures/hormone-lifespan-gonadotropin-source-medians.json', import.meta.url), 'utf8'));

async function open(page, patient, value = '2') {
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
  await page.locator('#labSubstance').fill('FSH');
  await page.locator('#labSubstanceDropdown [data-id="fsh"]').click();
  await page.locator('#labValue').fill(value);
  await expect(panel(page)).toBeVisible();
}

async function stage(page, kind, value) {
  await quickSelect(page, 'Kind', kind);
  await quickSelect(page, 'Stage', value);
  await closePatientEditor(page);
}

async function stableMaleGeometry(page) {
  const line = panel(page).locator('[data-stable-reference-line="fsh"]');
  await expect(line).toHaveCount(1);
  await expect(panel(page).locator('[data-reference-line="fsh"], [data-reference-background="fsh"]')).toHaveCount(0);
  return line.evaluate(node => ({ path: node.getAttribute('d'),
    divisor: Number(node.dataset.divisor), ceiling: Number(node.dataset.ceiling),
    viewBox: node.ownerSVGElement.getAttribute('viewBox') }));
}

async function expectPoint(page, value, median, profile, view = 'life') {
  // Both sexes keep the exact Zec group median separate from the educational
  // line. Female life uses the approved log concentration map, while puberty
  // uses a shared linear 0–8 IU/L axis. Select this contract from the expected
  // source and explicitly requested view, never from whichever DOM path exists.
  const stableMale = profile === 'zec2012-male-fsh-age-1-8';
  if (!stableMale) {
    expect(profile).toMatch(/^zec2012-female-fsh-age-(1-4|4-8|8-11)$/);
    expect(['life', 'puberty']).toContain(view);
    const chart = panel(page).locator('[data-lifespan="chart"]');
    await expect(chart).toHaveAttribute('data-female-gonadotropin-view', view);
    await expect(chart).toHaveAttribute('data-period-unit', 'IU/L');
    await expect(chart).toHaveAttribute('data-period-ceiling', view === 'life' ? '70' : '8');
    await expect(chart).toHaveAttribute('data-scale-transform', view === 'life' ? 'log1p' : 'linear');
    await expect(panel(page).locator('[data-reference-line="fsh"]')).toHaveCount(0);
  }
  await expect(dot(page)).toHaveCount(1);
  await expect(dot(page)).toHaveAttribute('data-profile', profile);
  await expect(dot(page)).toHaveAttribute('data-reference-statistic', 'group-median');
  await expect.poll(async () => Number(await dot(page).getAttribute('data-value'))).toBeCloseTo(value, 6);
  await expect.poll(async () => Number(await dot(page).getAttribute('data-median'))).toBeCloseTo(median, 6);
  await expect.poll(async () => Number(await dot(page).getAttribute('data-reference-value'))).toBeCloseTo(median, 6);
  // Read one current SVG snapshot: ResizeObserver can replace its children.
  let geometry;
  await expect.poll(async () => {
    geometry = await panel(page).evaluate((host, { stableMale, view, value, median }) => {
      const group = host.querySelector('[data-patient-concentration]');
      const point = group?.querySelector('[data-result-point]');
      const ref = group?.querySelector('[data-median-point]');
      const line = group?.ownerSVGElement?.querySelector(stableMale
        ? '[data-stable-reference-line="fsh"]'
        : '[data-period-hormone="fsh"]');
      if (!point || !ref || !line) return null;
      const x = Number(point.getAttribute('cx'));
      let lo = 0, hi = line.getTotalLength();
      for (let i = 0; i < 32; i++) {
        const mid = (lo + hi) / 2;
        if (line.getPointAtLength(mid).x < x) lo = mid; else hi = mid;
      }
      const period = stableMale ? null : window.VildaHormoneLifespanDisplay
        .buildFemaleGonadotropins(window.VildaHormoneLifespanData)[view];
      return { x, y: Number(point.getAttribute('cy')), rx: Number(ref.getAttribute('cx')),
        ry: Number(ref.getAttribute('cy')), curveY: line.getPointAtLength((lo + hi) / 2).y,
        bottom: Number(group.dataset.plotBottom), top: Number(group.dataset.plotTop), value: Number(group.dataset.value),
        divisor: Number(group.dataset.divisor), ceiling: Number(group.dataset.ceiling),
        ...(stableMale ? { lineDivisor: Number(line.dataset.divisor), lineCeiling: Number(line.dataset.ceiling) }
          : { resultHeight: period.valueFraction(value), referenceHeight: period.valueFraction(median) }) };
    }, { stableMale, view, value, median });
    return geometry?.value === value;
  }).toBe(true);
  expect(Object.values(geometry).every(Number.isFinite)).toBe(true);
  expect(geometry.x).toBe(geometry.rx);
  if (stableMale) {
    expect(geometry.divisor).toBe(8.4178);
    expect(geometry.ceiling).toBe(1.25);
    expect(geometry.lineDivisor).toBe(geometry.divisor);
    expect(geometry.lineCeiling).toBe(geometry.ceiling);
    expect((geometry.bottom - geometry.ry) / (geometry.bottom - geometry.top))
      .toBeCloseTo(median / geometry.divisor / geometry.ceiling, 6);
    expect((geometry.bottom - geometry.y) / (geometry.bottom - geometry.top))
      .toBeCloseTo(value / geometry.divisor / geometry.ceiling, 6);
    // At this 3-year-old fixture the illustrative line differs from 0.48:
    // the exact Zec reference must remain separate rather than snap to it.
    expect(Math.abs(geometry.ry - geometry.curveY)).toBeGreaterThan(0.05);
    expect((geometry.bottom - geometry.y) / (geometry.bottom - geometry.ry)).toBeCloseTo(value / median, 6);
  } else {
    expect(geometry.divisor).toBe(view === 'life' ? 70 : 8);
    expect(geometry.ceiling).toBe(1);
    expect((geometry.bottom - geometry.y) / (geometry.bottom - geometry.top))
      .toBeCloseTo(geometry.resultHeight, 6);
    expect((geometry.bottom - geometry.ry) / (geometry.bottom - geometry.top))
      .toBeCloseTo(geometry.referenceHeight, 6);
    expect((geometry.bottom - geometry.y) / (geometry.bottom - geometry.ry))
      .toBeCloseTo(geometry.resultHeight / geometry.referenceHeight, 6);
    // These Table 2 group medians differ from the life synthesis and Madsen
    // puberty model. Do not snap Zec's original number onto either curve.
    expect(Math.abs(geometry.ry - geometry.curveY)).toBeGreaterThan(0.05);
  }
  if (value < median) expect(geometry.y).toBeGreaterThan(geometry.ry);
  if (value > median) expect(geometry.y).toBeLessThan(geometry.ry);
  if (value === median) expect(geometry.y).toBeCloseTo(geometry.ry, 6);
}

async function expectClinicalAgeComparison(page) {
  await expect.poll(() => page.evaluate(() => window.VildaLabPubertyRuntime.getAssessment()?.evaluation?.referencePreview?.byAge?.status))
    .toMatch(/^(within|above|below)$/);
}

async function patientState(page) {
  return page.evaluate(() => ({ shared: window.VildaPersistence.readShared(), assessment: window.VildaLabPubertyRuntime.getAssessment() }));
}

test('Zec requires current G1; a number without a type, G2, P1 and unknown stage never supply the dot or block clinical age assessment', async ({ page }) => {
  await open(page, { sex: 'M', age: 3, ageMonths: 0, tannerStage: '1' });
  const original = await stableMaleGeometry(page);
  await expect(dot(page)).toHaveCount(0);
  await expectClinicalAgeComparison(page);
  await stage(page, 'G', '1');
  await expectPoint(page, 2, 0.48, 'zec2012-male-fsh-age-1-8');
  expect(await stableMaleGeometry(page)).toEqual(original);
  for (const [kind, value] of [['G', '2'], ['G', ''], ['P', '1']]) {
    await stage(page, kind, value);
    await expect(dot(page)).toHaveCount(0);
    await expectClinicalAgeComparison(page);
    expect(await stableMaleGeometry(page)).toEqual(original);
  }
  await stage(page, 'G', '1');
  await expectPoint(page, 2, 0.48, 'zec2012-male-fsh-age-1-8');
  expect(await stableMaleGeometry(page)).toEqual(original);
  await quickSelect(page, 'Sex', 'F');
  await expect(page.locator('#labPubertyKind')).toHaveValue('unspecified');
  await expect(page.locator('#labPubertyStage')).toHaveValue('');
  await expect(dot(page)).toHaveCount(0);
  await expectClinicalAgeComparison(page);
  await stage(page, 'Th', '1');
  await expectPoint(page, 2, 2.57, 'zec2012-female-fsh-age-1-4');
});

test('female group boundaries select exact Table 2 medians and equivalent units retain the point', async ({ page }) => {
  await open(page, { sex: 'F', age: 3, ageMonths: 0 });
  await stage(page, 'Th', '1');
  await expectPoint(page, 2, 2.57, 'zec2012-female-fsh-age-1-4');
  for (const [age, median, profile] of [[4, 1.07, 'zec2012-female-fsh-age-4-8'], [8, 1.55, 'zec2012-female-fsh-age-8-11']]) {
    await quickFill(page, 'AgeYears', String(age));
    // A new entered age does not renew the former visit's observation.
    // Explicitly assess Th1 for this boundary case through the shared editor.
    await stage(page, 'Th', '1');
    await closePatientEditor(page);
    await expectPoint(page, 2, median, profile);
  }
  await page.locator('#labUnit').selectOption('mIU/mL');
  await expectPoint(page, 2, 1.55, 'zec2012-female-fsh-age-8-11');
  await quickFill(page, 'AgeYears', '11');
  await closePatientEditor(page);
  await expect(dot(page)).toHaveCount(0);
  await expectClinicalAgeComparison(page);
});

test('FSH point sits below, on and above its group median and cannot survive an inexact result', async ({ page }) => {
  await open(page, { sex: 'M', age: 3, ageMonths: 0 }, '0.24');
  const original = await stableMaleGeometry(page);
  await stage(page, 'G', '1');
  for (const value of [0.24, 0.48, 0.96]) {
    await page.locator('#labValue').fill(String(value));
    await expectPoint(page, value, 0.48, 'zec2012-male-fsh-age-1-8');
    expect(await stableMaleGeometry(page)).toEqual(original);
  }
  for (const value of ['<0.48', '']) {
    await page.locator('#labValue').fill(value);
    await expect(dot(page)).toHaveCount(0);
    expect(await stableMaleGeometry(page)).toEqual(original);
  }
  await page.locator('#labValue').fill('0.48');
  await expectPoint(page, 0.48, 0.48, 'zec2012-male-fsh-age-1-8');
  expect(await stableMaleGeometry(page)).toEqual(original);
});

test('FSH comparison keeps its own-sex Madsen median independent of Tanner and restores the ordinary Zec reference', async ({ page }) => {
  const median = sourceMedians.puberty.find(row => row.sex === 'female' && row.analyte === 'fsh' && row.ageYears === 8).median;
  async function expectComparisonPoint() {
    const chart = panel(page).locator('[data-lifespan="chart"]');
    await expect(chart).toHaveAttribute('data-comparison-scale', 'linear');
    await expect(chart).toHaveAttribute('data-comparison-min', '0');
    await expect(chart).toHaveAttribute('data-comparison-max', '8');
    await expect(panel(page).locator('[data-reference-line="fsh"]')).toHaveCount(2);
    for (const sex of ['female', 'male']) {
      const line = panel(page).locator(`[data-comparison-sex="${sex}"]`);
      await expect(line).toHaveCount(1);
      await expect(line).toHaveAttribute('data-comparison-curve', 'fsh');
      await expect(line).toHaveAttribute('data-profile', `madsen2022-${sex}-fsh${sex === 'female' ? '-sex-comparison' : ''}`);
      await expect(line).toHaveAttribute('data-common-scale', 'linear');
      await expect(line).toHaveAttribute('data-unit', 'IU/L');
    }
    await expect(dot(page)).toHaveCount(1);
    await expect(dot(page)).toHaveAttribute('data-profile', 'madsen2022-female-fsh-sex-comparison');
    await expect(dot(page)).toHaveAttribute('data-reference-statistic', 'median');
    await expect(dot(page)).toHaveAttribute('data-unit', 'IU/L');
    await expect(dot(page)).toHaveAttribute('data-value', '2');
    await expect.poll(async () => Number(await dot(page).getAttribute('data-median'))).toBeCloseTo(median, 8);
    await expect.poll(async () => Number(await dot(page).getAttribute('data-reference-value'))).toBeCloseTo(median, 8);
    const note = panel(page).locator('[data-lifespan="scale-note"]');
    await expect(note).toContainText('Mediany stężeń · wspólna skala IU/L');
    await expect(note).not.toContainText('brak dopasowanych median obu płci');
    await expect(note).not.toContainText('Uzupełnij stadium');
    const geometry = await chart.evaluate(svg => {
      const group = svg.querySelector('[data-patient-concentration]');
      const result = group.querySelector('[data-result-point]');
      const reference = group.querySelector('[data-median-point]');
      const bottom = Number(group.dataset.plotBottom), top = Number(group.dataset.plotTop);
      return { resultX: Number(result.getAttribute('cx')), referenceX: Number(reference.getAttribute('cx')),
        resultHeight: (bottom - Number(result.getAttribute('cy'))) / (bottom - top),
        referenceHeight: (bottom - Number(reference.getAttribute('cy'))) / (bottom - top),
        paths: [...svg.querySelectorAll('[data-comparison-curve="fsh"]')].map(line => line.getAttribute('d')) };
    });
    expect(geometry.resultX).toBe(geometry.referenceX);
    expect(geometry.resultHeight).toBeCloseTo(2 / 8, 8);
    expect(geometry.referenceHeight).toBeCloseTo(median / 8, 8);
    return geometry;
  }
  await open(page, { sex: 'F', age: 8, ageMonths: 0 });
  const withoutTanner = await patientState(page);
  await panel(page).locator('[data-view="puberty"]').click();
  await panel(page).getByRole('button', { name: 'Porównaj płcie', exact: true }).click();
  const comparison = await expectComparisonPoint();
  expect(await patientState(page)).toEqual(withoutTanner);
  await panel(page).locator('.vhl-compare-toggle').click();
  // The comparison-only Madsen profile must not supply an ordinary point.
  await expect(dot(page)).toHaveCount(0);
  expect(await patientState(page)).toEqual(withoutTanner);
  await stage(page, 'Th', '1');
  await expectPoint(page, 2, 1.55, 'zec2012-female-fsh-age-8-11', 'puberty');
  const before = await patientState(page);
  await panel(page).locator('[data-view="puberty"]').click();
  await expectPoint(page, 2, 1.55, 'zec2012-female-fsh-age-8-11', 'puberty');
  await panel(page).getByRole('button', { name: 'Porównaj płcie', exact: true }).click();
  expect(await expectComparisonPoint()).toEqual(comparison);
  await expectClinicalAgeComparison(page);
  expect(await patientState(page)).toEqual(before);
  await panel(page).locator('.vhl-compare-toggle').click();
  await expectPoint(page, 2, 1.55, 'zec2012-female-fsh-age-8-11', 'puberty');
  expect(await patientState(page)).toEqual(before);
});

for (const width of [1440, 320]) {
  test(`Zec source and group labels fit inline and fullscreen at ${width}px without new fields or changing the assessment`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await open(page, { sex: 'M', age: 3, ageMonths: 0 });
    await stage(page, 'G', '1');
    await expectPoint(page, 2, 0.48, 'zec2012-male-fsh-age-1-8');
    const original = await stableMaleGeometry(page);
    const before = await patientState(page);
    await panel(page).getByText('O wykresie i źródła', { exact: true }).click();
    for (const fullscreen of [false, true]) {
      if (fullscreen) {
        await panel(page).getByRole('button', { name: 'Powiększ', exact: true }).click();
        await expect(page.locator('dialog.vhl-fullscreen-dialog')).toBeVisible();
      }
      await expectPoint(page, 2, 0.48, 'zec2012-male-fsh-age-1-8');
      await expect(panel(page).locator('input, select, textarea')).toHaveCount(0);
      const source = panel(page).locator('[data-lifespan="source-copy"]');
      await expect(source).toContainText('Zec');
      await expect(source).toContainText('Roche');
      await expect(source).toContainText(/Tanner(?:a)? 1/);
      await expect(source).not.toContainText('Mediana rocznej grupy wieku');
      await expect(source).not.toContainText('Porównanie nie uwzględnia stadium Tannera');
      await expect(source).toContainText('mediana grupy 1–<8 lat');
      await expect(dot(page)).toHaveAttribute('aria-label', /Mediana grupy 1–<8 lat, Tanner 1/);
      const fits = await dot(page).evaluate(group => {
        const bounds = group.ownerSVGElement.viewBox.baseVal;
        return [...group.querySelectorAll('text, circle')].every(node => {
          const box = node.getBBox();
          return box.x >= -1 && box.x + box.width <= bounds.width + 1 && box.y >= -1 && box.y + box.height <= bounds.height + 1;
        });
      });
      expect(fits).toBe(true);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
      await panel(page).screenshot({ path: test.info().outputPath(`fsh-zec-${fullscreen ? 'fullscreen' : 'inline'}-${width}.png`) });
    }
    await panel(page).getByRole('button', { name: 'Zamknij', exact: true }).click();
    await expectPoint(page, 2, 0.48, 'zec2012-male-fsh-age-1-8');
    expect(await stableMaleGeometry(page)).toEqual(original);
    expect(await patientState(page)).toEqual(before);
  });
}
