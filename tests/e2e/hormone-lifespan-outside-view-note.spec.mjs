import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test as base } from '../support/test-czas.mjs';

// Real mount/update and real source qualification. Every test owns its origin;
// the one converter case consumes shared main-form data without creating a vault.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const test = base.extend({
  diagramOrigin: async ({ page }, use) => {
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    const server = spawn(process.execPath, [path.join(root, 'tests/support/static-server.mjs')], {
      cwd: root, env: { ...process.env, PORT: '0' }, stdio: ['ignore', 'pipe', 'inherit'],
    });
    try {
      const origin = await new Promise((resolve, reject) => {
        let output = '';
        server.stdout.on('data', chunk => {
          output += chunk;
          const found = output.match(/http:\/\/127\.0\.0\.1:\d+/);
          if (found) resolve(found[0]);
        });
        server.once('error', reject);
        server.once('exit', code => reject(new Error(`Diagram server exited: ${code}`)));
      });
      await page.route('**/*', route => route.request().url().startsWith(origin) ? route.continue() : route.abort());
      await use(origin);
      expect(errors).toEqual([]);
    } finally {
      if (server.exitCode === null && server.signalCode === null) {
        const closed = new Promise(resolve => { server.once('exit', resolve); });
        server.kill('SIGKILL');
        await closed;
      }
    }
  },
});
test.use({ serviceWorkers: 'block', reducedMotion: 'reduce' });

const panel = page => page.locator('.vilda-hormone-lifespan');
const chart = page => panel(page).locator('[data-lifespan="chart"]');
const caption = page => panel(page).locator('[data-lifespan="scale-note"]');
const description = page => chart(page).locator('[data-lifespan="chart-desc"]');
const point = (page, id = 'lh') => chart(page).locator(`[data-patient-concentration="${id}"]`);
const period = (page, id) => panel(page).locator(`[data-view="${id}"]`);
const hormone = (page, id) => panel(page).locator(`[data-hormone="${id}"]`);
const outside = /Wiek pacjenta jest poza wybranym okresem/;
const note = range => `Wiek pacjenta jest poza wybranym okresem (${range}). Wynik i odniesienie zobaczysz w „Całym życiu”.`;
const context = extra => ({
  analyte: 'lh', sex: 'male', ageYears: 6, ageUpperYears: 6,
  ageUpperInclusive: true, preterm: 'no', sourceStatus: 'ready',
  identityKey: 'fictional-outside-period', measurement: { value: 2, unit: 'IU/L' }, ...extra,
});
async function update(page, data) {
  return page.evaluate(data => {
    window.outsideViewChart.update(data);
    return window.VildaHormoneLifespanReference.evaluate(window.VildaHormoneLifespanData.patientPointData, data);
  }, data);
}
async function openComponent(page, origin, data = context(), width = 1440) {
  await page.setViewportSize({ width, height: 1000 });
  await page.route('**/__test-outside-view-note', route => route.fulfill({
    contentType: 'text/html',
    body: `<!doctype html><html lang="pl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
      <link rel="stylesheet" href="/ios26-v2.css"><link rel="stylesheet" href="/style.css">
      <link rel="stylesheet" href="/vilda_hormone_lifespan.css">
      <style>body{display:block;margin:0}main{width:100%;box-sizing:border-box}</style></head>
      <body><main id="diagram"></main><script src="/vilda_hormone_lifespan_data.js"></script>
      <script src="/vilda_hormone_lifespan_reference.js"></script><script src="/vilda_hormone_lifespan_display.js"></script>
      <script src="/vilda_hormone_lifespan_observations.js"></script><script src="/vilda_hormone_lifespan.js"></script></body></html>`,
  }));
  await page.goto(`${origin}/__test-outside-view-note`, { waitUntil: 'load' });
  await page.evaluate(() => {
    window.outsideViewChart = window.VildaHormoneLifespan.mount({ host: document.querySelector('#diagram') });
  });
  const source = await update(page, data);
  await expect(panel(page)).toBeVisible();
  return source;
}
async function expectNote(page, range) {
  await expect(caption(page)).toBeVisible();
  await expect(caption(page)).toHaveText(note(range));
  await expect(description(page)).toContainText(note(range));
  expect((await description(page).textContent()).split(note(range))).toHaveLength(2);
  await expect(chart(page).locator('[data-patient-concentration]')).toHaveCount(0);
}
async function expectNoNote(page) {
  await expect(caption(page)).not.toContainText(outside);
  await expect(description(page)).not.toContainText(outside);
}
async function pointData(page, id) {
  return point(page, id).evaluate(group => ({
    profile: group.dataset.profile, age: group.dataset.ageLower || group.dataset.age, upper: group.dataset.ageUpper,
    value: group.dataset.value, reference: group.dataset.referenceValue,
  }));
}
async function noOverflow(page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
}

for (const width of [1440, 320]) {
  test(`M6 LH explains the preserved ordinary puberty view after comparison at ${width}px`, async ({ page, diagramOrigin }, testInfo) => {
    const data = context({ ageUpperYears: 6 + 1 / 12, ageUpperInclusive: false });
    const qualified = await openComponent(page, diagramOrigin, data, width);
    expect(qualified.status).toBe('ready');
    await expect(point(page)).toHaveCount(1);
    const original = await pointData(page, 'lh');
    expect(original.profile).toBe('madsen2022-male-lh');
    await panel(page).getByRole('button', { name: 'Porównaj płcie', exact: true }).click();
    await expect(period(page, 'puberty')).toHaveAttribute('aria-pressed', 'true');
    await expect(point(page)).toHaveCount(1);
    await panel(page).getByRole('button', { name: 'Zakończ porównanie', exact: true }).click();
    await expect(period(page, 'puberty')).toHaveAttribute('aria-pressed', 'true');
    await expect(point(page)).toHaveCount(0);
    // Capture before asserting visibility: the immutable baseline hides this caption.
    await testInfo.attach(`M6-LH-outside-puberty-${width}`, { body: await panel(page).screenshot(), contentType: 'image/png' });
    await expectNote(page, '8–20 lat');
    expect(await update(page, data)).toEqual(qualified);
    await expectNote(page, '8–20 lat');
    await noOverflow(page);
    await period(page, 'life').click();
    await expect(point(page)).toHaveCount(1);
    expect(await pointData(page, 'lh')).toEqual(original);
    await expectNoNote(page);
  });
}

test('female inhibin B and AMH use the actual mixed axis when LH is selected', async ({ page, diagramOrigin }) => {
  const data = context({ analyte: 'inhibin_b', sex: 'female', measurement: { value: 33, unit: 'pg/mL' } });
  const qualified = await openComponent(page, diagramOrigin, data);
  expect(qualified.status).toBe('ready');
  await expect(point(page, 'inhb')).toHaveCount(1);
  const original = await pointData(page, 'inhb');
  expect(original.profile).toBe('borelli2025-female-inhb-age-5p6-47');
  await period(page, 'puberty').click();
  await expectNote(page, '8–20 lat');
  await hormone(page, 'lh').click();
  await expect(chart(page)).toHaveAttribute('data-period-min', '6');
  await expect(chart(page)).toHaveAttribute('data-period-max', '16');
  await expect(point(page, 'inhb')).toHaveCount(1);
  expect(await pointData(page, 'inhb')).toEqual(original);
  await expect(point(page, 'lh')).toHaveCount(0);
  await expectNoNote(page);
  await hormone(page, 'lh').click();
  await expectNote(page, '8–20 lat');
  expect(await update(page, data)).toEqual(qualified);

  // A qualified AMH at 18 lies inside ordinary puberty, but outside the
  // female LH axis. The explanation must describe the axis actually shown.
  const adultAmh = context({ analyte: 'amh', sex: 'female', ageYears: 18, ageUpperYears: 18,
    measurement: { value: 2, unit: 'ng/mL' } });
  expect((await update(page, adultAmh)).status).toBe('ready');
  await expect(point(page, 'amh')).toHaveCount(1);
  const adultPoint = await pointData(page, 'amh');
  expect(adultPoint.profile).toBe('fda2017-female-amh-age-18-under26');
  await period(page, 'puberty').click();
  await expect(point(page, 'amh')).toHaveCount(1);
  await expectNoNote(page);
  await hormone(page, 'lh').click();
  await expect(chart(page)).toHaveAttribute('data-period-min', '6');
  await expect(chart(page)).toHaveAttribute('data-period-max', '16');
  await expectNote(page, '6–16 lat');
  await period(page, 'life').click();
  await expect(point(page, 'amh')).toHaveCount(1);
  expect(await pointData(page, 'amh')).toEqual(adultPoint);
  await expectNoNote(page);
});

test('M44 testosterone preserves its source mean and renders one explanation through fullscreen', async ({ page, diagramOrigin }) => {
  const data = context({ analyte: 'testosterone_total', ageYears: 44, ageUpperYears: 44, measurement: { value: 13, unit: 'nmol/L' } });
  const qualified = await openComponent(page, diagramOrigin, data, 320);
  expect(qualified.status).toBe('ready');
  await expect(point(page, 't')).toHaveAttribute('data-reference-statistic', 'group-mean');
  const original = await pointData(page, 't');
  expect(Number(original.reference)).toBe(18.1);
  for (const [id, range] of [['mini', '0–12 mies.'], ['puberty', '8–20 lat']]) {
    await period(page, id).click();
    await expectNote(page, range);
    await panel(page).getByRole('button', { name: 'Powiększ', exact: true }).click();
    await expect(page.locator('dialog.vhl-fullscreen-dialog')).toBeVisible();
    await expectNote(page, range);
    await page.keyboard.press('Escape');
    await expect(page.locator('dialog.vhl-fullscreen-dialog')).toHaveCount(0);
    await expectNote(page, range);
  }
  await noOverflow(page);
  await period(page, 'life').click();
  await expectNoNote(page);
  expect(await pointData(page, 't')).toEqual(original);
});

for (const example of [
  { name: 'incompatible LH method', data: context({ assayMethodId: 'anshlite-lh' }), reason: 'incompatible-assay', message: 'Brak wartości odniesienia dla potwierdzonej metody tej próbki.' },
  { name: 'ordinary female LH source gap', data: context({ sex: 'female', ageYears: 3, ageUpperYears: 3 }), reason: 'unsupported-age', message: 'Dla tego wieku brak wartości odniesienia pozwalającej nanieść wynik.' },
  { name: 'testosterone childhood gap', data: context({ analyte: 'testosterone_total', ageYears: 2, ageUpperYears: 2, measurement: { value: 1, unit: 'nmol/L' } }), reason: 'unsupported-age', message: 'Dla tego wieku brak wartości odniesienia pozwalającej nanieść wynik.' },
]) {
  test(`${example.name} keeps the qualification reason outside the view without promising a point`, async ({ page, diagramOrigin }) => {
    expect(await openComponent(page, diagramOrigin, example.data)).toEqual({ status: 'unavailable', reason: example.reason });
    // Female LH uses its 6–16 puberty axis; the other cases use mini 0–1.
    await period(page, example.data.sex === 'female' ? 'puberty' : 'mini').click();
    if (example.data.sex === 'female') {
      await expect(chart(page)).toHaveAttribute('data-period-min', '6');
      await expect(chart(page)).toHaveAttribute('data-period-max', '16');
    }
    await expect(caption(page)).toBeVisible();
    await expect(caption(page)).toContainText(example.message);
    await expect(chart(page).locator('[data-patient-concentration]')).toHaveCount(0);
    await expectNoNote(page);
  });
}

test('absent, censored, unknown, deselected and comparison results never get an outside-view promise', async ({ page, diagramOrigin }) => {
  const data = context();
  await openComponent(page, diagramOrigin, data);
  await period(page, 'puberty').click();
  await expectNote(page, '8–20 lat');
  for (const extra of [
    { measurement: null }, { measurement: { value: 2, unit: 'IU/L', operator: '<' } },
    { ageYears: null, ageUpperYears: null },
  ]) {
    await update(page, { ...data, ...extra });
    await expect(chart(page).locator('[data-patient-concentration]')).toHaveCount(0);
    await expectNoNote(page);
  }
  await update(page, data);
  await hormone(page, 'lh').click();
  await expectNoNote(page);
  await hormone(page, 'fsh').click();
  await expectNoNote(page);
  await panel(page).getByRole('button', { name: 'Porównaj płcie', exact: true }).click();
  await expectNoNote(page);
  await expect(chart(page).locator('[data-patient-concentration]')).toHaveCount(0);
  await update(page, context({ analyte: 'amh', ageYears: 12, ageUpperYears: 12, measurement: { value: 20, unit: 'ng/mL' } }));
  await panel(page).getByRole('button', { name: 'Porównaj płcie', exact: true }).click();
  await expect(period(page, 'puberty')).toHaveAttribute('aria-pressed', 'true');
  await expect(chart(page).locator('[data-patient-concentration]')).toHaveCount(0);
  await expectNoNote(page);
});

test('axis endpoints and the source age interval retain their existing eligibility', async ({ page, diagramOrigin }) => {
  await openComponent(page, diagramOrigin);
  await period(page, 'puberty').click();
  for (const ageYears of [8, 20]) {
    const data = context({ analyte: 'inhibin_b', ageYears, ageUpperYears: ageYears, measurement: { value: 100, unit: 'pg/mL' } });
    const source = await update(page, data);
    expect(source.status).toBe('ready');
    await period(page, 'puberty').click();
    await expect(point(page, 'inhb')).toHaveCount(1);
    await expectNoNote(page);
  }
  const ambiguous = context({ ageYears: 16, ageUpperYears: 16 + 1 / 12, ageUpperInclusive: false });
  expect(await update(page, ambiguous)).toEqual({ status: 'unavailable', reason: 'ambiguous-age' });
  await period(page, 'puberty').click();
  await expect(caption(page)).toContainText('Podany przedział wieku wykracza poza dostępny profil odniesienia.');
  await expectNoNote(page);
});

test('ready, unavailable, reset, analyte and identity transitions clear the accessible explanation', async ({ page, diagramOrigin }) => {
  const data = context();
  await openComponent(page, diagramOrigin, data);
  await period(page, 'puberty').click();
  await expectNote(page, '8–20 lat');
  await update(page, { ...data, assayMethodId: 'anshlite-lh' });
  await expectNoNote(page);
  await expect(caption(page)).toContainText('potwierdzonej metody');
  await update(page, data);
  await expectNote(page, '8–20 lat');
  await update(page, { ...data, sourceStatus: 'unavailable' });
  await expect(panel(page)).toBeHidden();
  await expect(description(page)).not.toContainText(outside);
  await update(page, data);
  await expect(period(page, 'life')).toHaveAttribute('aria-pressed', 'true');
  await expectNoNote(page);
  await period(page, 'puberty').click();
  await expectNote(page, '8–20 lat');
  await page.evaluate(() => window.outsideViewChart.clear());
  await expect(panel(page)).toBeHidden();
  await expect(description(page)).not.toContainText(outside);
  await update(page, data);
  await expect(period(page, 'life')).toHaveAttribute('aria-pressed', 'true');
  await expectNoNote(page);
  await period(page, 'puberty').click();
  await update(page, { ...data, identityKey: 'fictional-next-person' });
  await expect(period(page, 'life')).toHaveAttribute('aria-pressed', 'true');
  await expectNoNote(page);
  await period(page, 'puberty').click();
  await update(page, context({ analyte: 'testosterone_total', ageYears: 44, ageUpperYears: 44, measurement: { value: 13, unit: 'nmol/L' } }));
  await expect(period(page, 'life')).toHaveAttribute('aria-pressed', 'true');
  await expectNoNote(page);
});

test('the real converter reuses shared main-form data and view controls leave the result and assessment untouched', async ({ page, diagramOrigin }) => {
  await page.setViewportSize({ width: 320, height: 1000 });
  await page.addInitScript(() => {
    localStorage.setItem('vilda-terms-accepted-v1', JSON.stringify({ version: 1, acceptedAtISO: new Date().toISOString() }));
    const date = new Date(), day = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    for (const key of ['shown', 'closed']) localStorage.setItem(`vilda-reminders-${key}-v1`, `${day}|${Date.now()}`);
  });
  await page.goto(`${diagramOrigin}/przelicznik-jednostek.html`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.VildaPersistence && window.VildaHormoneLifespanRuntime);
  const consent = page.locator('#consent-decline');
  if (await consent.isVisible()) await consent.click();
  await page.evaluate(() => {
    if (!window.VildaPersistence.writeShared({ name: 'Fikcyjny pacjent poza okresem', sex: 'M', age: 6, ageMonths: 0 }, { force: true })) {
      throw new Error('Cannot seed fictional shared patient');
    }
    document.dispatchEvent(new CustomEvent('vilda:session-changed'));
  });
  await page.locator('#labSubstance').fill('LH');
  await page.locator('#labSubstanceDropdown [data-id="lh"]').click();
  await page.locator('#labUnit').selectOption('IU/L');
  await page.locator('#labValue').fill('2');
  await expect(point(page)).toHaveAttribute('data-age-lower', '6');
  const original = await pointData(page, 'lh');
  const before = await page.evaluate(() => ({ shared: window.VildaPersistence.readShared(), assessment: window.VildaLabPubertyRuntime.getAssessment() }));
  expect(String(before.shared.age)).toBe('6');
  await panel(page).getByRole('button', { name: 'Porównaj płcie', exact: true }).click();
  await expect(period(page, 'puberty')).toHaveAttribute('aria-pressed', 'true');
  await expect(point(page)).toHaveCount(1);
  await panel(page).getByRole('button', { name: 'Zakończ porównanie', exact: true }).click();
  await expectNote(page, '8–20 lat');
  await expect(page.locator('#labValue')).toHaveValue('2');
  await noOverflow(page);
  await period(page, 'life').click();
  await expectNoNote(page);
  expect(await pointData(page, 'lh')).toEqual(original);
  expect(await page.evaluate(() => ({ shared: window.VildaPersistence.readShared(), assessment: window.VildaLabPubertyRuntime.getAssessment() }))).toEqual(before);
});
