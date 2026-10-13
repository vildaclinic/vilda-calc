import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { expect, test } from '../support/test-czas.mjs';

// Real converter input and source eligibility. The patient is fictional; no
// Tanner stage, cycle phase, menarche, assay or specimen is inferred from age.
test.use({ serviceWorkers: 'block', reducedMotion: 'reduce' });
const examples = [
  { id: 'amh', hormone: 'amh', name: 'AMH', raw: '0.45', unit: 'ng/mL',
    profile: 'jopling2018-female-amh-age-15-under18',
    median: 21.14, medianInput: 21.14 * .1401, divisor: 28.99, statistic: 'group-median',
    canonical: value => value / .1401, high: 10, outsideAge: 18 },
  { id: 'inhibin_b', hormone: 'inhb', name: 'Inhibina B', raw: '80', unit: 'pg/mL',
    profile: 'borelli2025-female-inhb-age-8-20',
    median: 44, medianInput: 44, divisor: 52.474, statistic: 'median',
    canonical: value => value, high: 1000, outsideAge: 21 },
];
const panel = page => page.locator('.vilda-hormone-lifespan');
const point = (page, example) => panel(page).locator(`[data-patient-concentration="${example.hormone}"]`);
const state = page => page.evaluate(() => ({ shared: window.VildaPersistence.readShared(), assessment: window.VildaLabPubertyRuntime.getAssessment() }));

async function patient(page, years = 15, sex = 'F') {
  await page.evaluate(({ years, sex }) => {
    if (!window.VildaPersistence.writeShared({ name: 'Fikcyjny pacjent odniesień AMH inhibiny B', sex, age: years, ageMonths: 0 }, { force: true }))
      throw new Error('Cannot seed fictional patient context');
    document.dispatchEvent(new CustomEvent('vilda:session-changed'));
  }, { years, sex });
}

async function open(page, width = 1440) {
  await page.setViewportSize({ width, height: 1000 });
  await page.route('**/*', route => {
    const url = new URL(route.request().url());
    return url.hostname === '127.0.0.1' || /^(data|blob):$/.test(url.protocol) ? route.continue() : route.abort();
  });
  await page.addInitScript(() => {
    localStorage.setItem('vilda-terms-accepted-v1', JSON.stringify({ version: 1, acceptedAtISO: new Date().toISOString() }));
    const d = new Date(), iso = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
    for (const key of ['shown', 'closed']) localStorage.setItem(`vilda-reminders-${key}-v1`, `${iso}|${Date.now()}`);
  });
  await page.goto('/przelicznik-jednostek.html', { waitUntil: 'load' });
  await page.waitForFunction(() => window.VildaHormoneLifespanRuntime && window.VildaHormoneLifespanReference && window.VildaLabPubertyRuntime);
  const consent = page.locator('#consent-decline');
  if (await consent.isVisible()) await consent.click();
  await patient(page);
}

async function choose(page, example, raw = '') {
  await page.locator('#labSubstance').click();
  await page.locator('#labSubstance').fill(example.name);
  await page.locator(`#labSubstanceDropdown [data-id="${example.id}"]`).click();
  await page.locator('#labUnit').selectOption(example.unit);
  await page.locator('#labValue').fill(raw);
  await expect(panel(page)).toBeVisible();
}

async function geometry(page, example) {
  return panel(page).locator(`[data-female-stable-line="${example.hormone}"]`).evaluateAll(paths => paths.map(path => ({
    d: path.getAttribute('d'), divisor: path.dataset.divisor, ceiling: path.dataset.ceiling,
    plotTop: path.dataset.plotTop, plotBottom: path.dataset.plotBottom,
  })));
}

async function expectSourcePoint(page, example, inputValue, inputUnit = example.unit) {
  const group = point(page, example);
  const value = inputUnit === 'pmol/L' ? inputValue : example.canonical(inputValue);
  const overflow = value > example.divisor;
  await expect(group).toHaveCount(1);
  await expect(group).toHaveAttribute('data-profile', example.profile);
  await expect(group).toHaveAttribute('data-reference-statistic', example.statistic);
  await expect(group).toHaveAttribute('data-divisor', String(example.divisor));
  await expect(group).toHaveAttribute('data-ceiling', '1');
  await expect.poll(async () => Number(await group.getAttribute('data-value'))).toBeCloseTo(value, 8);
  await expect.poll(async () => Number(await group.getAttribute('data-reference-value'))).toBeCloseTo(example.median, 8);
  await expect(group.locator('[data-median-point]')).toHaveCount(1);
  await expect(group.locator('[data-result-point]')).toHaveCount(overflow ? 0 : 1);
  await expect(group.locator('[data-result-overflow="above"]')).toHaveCount(overflow ? 1 : 0);
  const actual = await group.evaluate(g => {
    const reference = g.querySelector('[data-median-point]'), result = g.querySelector('[data-result-point]');
    const top = +g.dataset.plotTop, bottom = +g.dataset.plotBottom;
    return {
      referenceHeight: (bottom - +reference.getAttribute('cy')) / (bottom - top),
      resultHeight: result ? (bottom - +result.getAttribute('cy')) / (bottom - top) : null,
      sameX: !result || reference.getAttribute('cx') === result.getAttribute('cx'),
    };
  });
  // These heights are tied to the published statistic and the unchanged scale,
  // never to the Y coordinate of the smoothed educational line.
  expect(actual.referenceHeight).toBeCloseTo(example.median / example.divisor, 8);
  expect(actual.sameX).toBe(true);
  if (!overflow) expect(actual.resultHeight).toBeCloseTo(value / example.divisor, 8);
  if (example.id === 'amh') {
    await expect(group).toHaveAttribute('data-label-unit', inputUnit);
    await expect(group.locator('[data-dot-label="median"]')).toHaveText(inputUnit === 'ng/mL'
      ? 'Mediana grupy ≈2,96 ng/mL' : 'Mediana grupy ≈21,1 pmol/L');
    await expect(group).toHaveAccessibleName(/Mediana grupy 15.*18[,.]9/);
    await expect(group.locator('[data-dot-label="result"]')).toContainText(inputUnit);
  } else await expect(group.locator('[data-dot-label="median"]')).toHaveText('Mediana ≈44 pg/mL');
}

async function capture(page, name) {
  const directory = process.env.VILDA_FEMALE_REFERENCE_CAPTURE_DIR;
  if (!directory) return;
  await mkdir(directory, { recursive: true });
  await panel(page).screenshot({ path: join(directory, name + '.png') });
}

for (const width of [1440, 320]) for (const example of examples) {
  test(`F15 ${example.name} uses its source point with fixed ordinary curves at ${width}px`, async ({ page }) => {
    await open(page, width);
    await choose(page, example);
    await expect(panel(page).locator('input, select, textarea')).toHaveCount(0);
    for (const view of ['life', 'puberty']) {
      await panel(page).locator(`[data-view="${view}"]`).click();
      await page.locator('#labValue').fill('');
      await expect(point(page, example)).toHaveCount(0);
      const shape = await geometry(page, example);
      expect(shape.length).toBeGreaterThan(0);
      expect(shape.every(path => Number(path.divisor) === example.divisor && Number(path.ceiling) === 1)).toBe(true);
      for (const value of [Number(example.raw), example.medianInput, 0, example.high]) {
        await page.locator('#labValue').fill(String(value));
        await expectSourcePoint(page, example, value);
        await expect.poll(() => geometry(page, example)).toEqual(shape);
      }
      for (const raw of ['', '<' + example.raw]) {
        await page.locator('#labValue').fill(raw);
        await expect(point(page, example)).toHaveCount(0);
        await expect.poll(() => geometry(page, example)).toEqual(shape);
      }
      await page.locator('#labValue').fill(example.raw);
      await expectSourcePoint(page, example, Number(example.raw));
      const before = await state(page);
      await expect(panel(page).locator('[data-lifespan="scale-note"]')).not.toContainText('brak wartości odniesienia');
      const note = panel(page).locator('[data-lifespan="scale-note"]');
      await expect(note).toBeVisible();
      if (example.id === 'amh') await expect(note).toContainText(/osocz/i);
      else await expect(note).toContainText(/cykl/i);
      await capture(page, `${width}-${example.id}-${view}`);
      await panel(page).locator('.vhl-expand').click();
      await expect(page.locator('dialog.vhl-fullscreen-dialog')).toBeVisible();
      await expectSourcePoint(page, example, Number(example.raw));
      expect(await page.locator('dialog.vhl-fullscreen-dialog').evaluate(dialog => dialog.scrollWidth <= dialog.clientWidth + 1)).toBe(true);
      await page.keyboard.press('Escape');
      await expect(page.locator('dialog.vhl-fullscreen-dialog')).toHaveCount(0);
      await expect.poll(() => geometry(page, example)).toEqual(shape);
      expect(await state(page)).toEqual(before);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
      if (example.id === 'amh') {
        const positions = () => point(page, example).evaluate(g => ({
          resultY: +g.querySelector('[data-result-point]').getAttribute('cy'),
          referenceY: +g.querySelector('[data-median-point]').getAttribute('cy'),
        }));
        const beforeUnits = await positions();
        for (const [unit, raw] of [['pmol/L', String(.45 / .1401)], ['ng/mL', '0.45']]) {
          await page.locator('#labUnit').selectOption(unit);
          await page.locator('#labValue').fill(raw);
          await expectSourcePoint(page, example, Number(raw), unit);
          const afterUnits = await positions();
          expect(afterUnits.resultY).toBeCloseTo(beforeUnits.resultY, 8);
          expect(afterUnits.referenceY).toBeCloseTo(beforeUnits.referenceY, 8);
          await expect.poll(() => geometry(page, example)).toEqual(shape);
        }
      }
    }
  });
}

test('the whole-life comparison opens puberty for F15 but keeps comparison source eligibility separate', async ({ page }) => {
  await open(page);
  for (const example of examples) {
    await choose(page, example, example.raw);
    await expectSourcePoint(page, example, Number(example.raw));
    const ordinaryProfile = await point(page, example).getAttribute('data-profile');
    const before = await state(page);
    await panel(page).locator('.vhl-compare-toggle').click();
    await expect(panel(page).locator('[data-view="puberty"]')).toHaveAttribute('aria-pressed', 'true');
    if (example.id === 'amh') {
      // A female source alone does not provide a new calibrated sex comparison.
      await expect(point(page, example)).toHaveCount(0);
      await expect(panel(page).locator('[data-comparison-curve="amh"]')).toHaveCount(2);
    } else {
      const group = point(page, example);
      await expect(group).toHaveAttribute('data-profile', 'borelli2025-female-inhb-puberty-comparison');
      expect(ordinaryProfile).not.toBe('borelli2025-female-inhb-puberty-comparison');
      await expect(group).toHaveAttribute('data-reference-value', '44');
      await expect(group).toHaveAttribute('data-value', '80');
      await expect(group.locator('[data-result-point]')).toHaveCount(1);
      await expect(group.locator('[data-result-overflow]')).toHaveCount(0);
      await expect(panel(page).locator('[data-lifespan="chart"]')).toHaveAttribute('data-comparison-max', '400');
    }
    await panel(page).locator('.vhl-compare-toggle').click();
    await expectSourcePoint(page, example, Number(example.raw));
    await expect(point(page, example)).toHaveAttribute('data-profile', ordinaryProfile);
    expect(await state(page)).toEqual(before);
  }
});

test('leaving the source age coverage removes both result and source marker instead of extending the group', async ({ page }) => {
  await open(page);
  for (const example of examples) {
    await patient(page);
    await choose(page, example, example.raw);
    await expectSourcePoint(page, example, Number(example.raw));
    const shape = await geometry(page, example);
    await patient(page, example.outsideAge);
    await expect(point(page, example)).toHaveCount(0);
    await expect(panel(page).locator('[data-patient-age-marker]')).toHaveAttribute('data-patient-age-marker', String(example.outsideAge));
    await expect(panel(page).locator('[data-lifespan="scale-note"]')).toHaveText('Dla tego wieku nie udostępniono mediany źródłowej. Linia pokazuje ogólny przebieg zmian.');
    await expect.poll(() => geometry(page, example)).toEqual(shape);
  }
});

test('new ordinary female AMH sources never activate a quantitative puberty sex comparison', async ({ page }) => {
  await open(page);
  for (const age of [12, 13]) for (const sex of ['F', 'M']) {
    await patient(page, age, sex);
    await choose(page, examples[0], '0.45');
    // At thirteen both sexes have an ordinary source. At twelve the known
    // male source gap remains; neither situation licenses a new comparison.
    if (age === 13 || sex === 'F') {
      await expect(point(page, examples[0])).toHaveCount(1);
      await expect(point(page, examples[0])).toHaveAttribute('data-profile', sex === 'F' ? /^jopling2018-female/ : /^wang2020-male/);
    } else await expect(point(page, examples[0])).toHaveCount(0);
    await panel(page).locator('[data-view="puberty"]').click();
    await panel(page).locator('.vhl-compare-toggle').click();
    await expect(panel(page).locator('[data-view="puberty"]')).toHaveAttribute('aria-pressed', 'true');
    await expect(point(page, examples[0])).toHaveCount(0);
    await expect(panel(page).locator('[data-comparison-curve="amh"]')).toHaveCount(2);
  }
});

test.describe('female source points offline', () => {
  test.use({ serviceWorkers: 'allow' });
  test('the installed worker preserves both F15 source points after an offline reload', async ({ page, context }) => {
    test.setTimeout(180_000);
    await page.goto('/tests/fixtures/service-worker-runner.html');
    await page.evaluate(async () => {
      await navigator.serviceWorker.register('/service-worker-kalorii.js', { scope: '/' });
      await navigator.serviceWorker.ready;
    });
    await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller));
    await open(page);
    for (const example of examples) {
      await choose(page, example, example.raw);
      await expectSourcePoint(page, example, Number(example.raw));
    }
    await context.setOffline(true);
    await page.reload({ waitUntil: 'load' });
    await page.waitForFunction(() => Boolean(window.VildaHormoneLifespanRuntime));
    expect(await page.evaluate(() => navigator.onLine)).toBe(false);
    for (const example of examples) {
      await choose(page, example, example.raw);
      await expectSourcePoint(page, example, Number(example.raw));
      await panel(page).locator('[data-view="puberty"]').click();
      await expectSourcePoint(page, example, Number(example.raw));
    }
  });
});
