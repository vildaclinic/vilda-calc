import { expect, test } from '../support/test-czas.mjs';

test.use({ serviceWorkers: 'block', reducedMotion: 'reduce' });

const message = 'Te dane dotyczą niemowląt urodzonych o czasie; brak dopasowanego odniesienia dla wyniku.';
const panel = page => page.locator('.vilda-hormone-lifespan');
const caption = page => panel(page).locator('[data-lifespan="scale-note"]');
const point = page => panel(page).locator('[data-patient-concentration="amh"]');
const infant = (sex, extra = {}) => ({
  analyte: 'amh', sex, ageYears: .25, ageUpperYears: .25, ageUpperInclusive: true,
  preterm: 'no', sourceStatus: 'ready', identityKey: 'fictional-amh-qualification',
  measurement: { value: 2, unit: 'ng/mL' }, ...extra,
});

async function update(page, context) {
  return page.evaluate(context => {
    window.qualificationChart.update(context);
    return window.VildaHormoneLifespanReference.evaluate(window.VildaHormoneLifespanData, context);
  }, context);
}

async function open(page, width, context) {
  await page.setViewportSize({ width, height: 1000 });
  await page.route('**/__test-amh-qualification', route => route.fulfill({
    contentType: 'text/html',
    body: `<!doctype html><html lang="pl"><head><meta charset="utf-8">
      <meta name="viewport" content="width=device-width,initial-scale=1">
      <link rel="stylesheet" href="/ios26-v2.css"><link rel="stylesheet" href="/style.css">
      <link rel="stylesheet" href="/vilda_hormone_lifespan.css">
      <style>body{display:block;margin:0}main{width:100%;box-sizing:border-box}</style></head>
      <body><main id="diagram"></main><script src="/vilda_hormone_lifespan_data.js"></script>
      <script src="/vilda_hormone_lifespan_reference.js"></script>
      <script src="/vilda_hormone_lifespan_display.js"></script>
      <script src="/vilda_hormone_lifespan_observations.js"></script>
      <script src="/vilda_hormone_lifespan.js"></script></body></html>`,
  }));
  await page.goto('/__test-amh-qualification', { waitUntil: 'load' });
  await page.evaluate(() => {
    window.qualificationChart = window.VildaHormoneLifespan.mount({ host: document.querySelector('#diagram') });
  });
  await update(page, context);
  await expect(panel(page)).toBeVisible();
}

for (const width of [1440, 320]) {
  for (const sex of ['female', 'male']) {
    test(`ordinary AMH explains term qualification and restores the point: ${sex}, ${width}px`, async ({ page }) => {
      const context = infant(sex);
      await open(page, width, context);
      for (const view of ['life', 'mini']) {
        await panel(page).locator(`[data-view="${view}"]`).click();
        const expected = await update(page, context);
        expect(expected.status).toBe('ready');
        await expect(point(page)).toHaveCount(1);
        const reference = await point(page).getAttribute('data-reference-value');
        await expect(caption(page)).not.toHaveText(message);
        for (const preterm of ['unknown', 'yes']) {
          expect(await update(page, { ...context, preterm })).toEqual({ status: 'unavailable', reason: 'preterm-context' });
          await expect(point(page)).toHaveCount(0);
          await expect(caption(page)).toBeVisible();
          await expect(caption(page)).toHaveText(message);
          expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
        }
        expect((await update(page, context)).referenceValue).toBe(expected.referenceValue);
        await expect(point(page)).toHaveCount(1);
        await expect(point(page)).toHaveAttribute('data-reference-value', reference);
        await expect(caption(page)).not.toHaveText(message);
      }
      await update(page, { ...context, preterm: 'unknown' });
      await panel(page).locator('[data-hormone="amh"]').click();
      await expect(caption(page)).not.toHaveText(message);
      await panel(page).locator('[data-hormone="amh"]').click();
      await expect(caption(page)).toHaveText(message);
      await panel(page).locator('[data-view="puberty"]').click();
      await expect(caption(page)).not.toHaveText(message);
    });
  }
}

test('ordinary AMH does not add the qualification message before a usable exact result exists', async ({ page }) => {
  const context = infant('female', { preterm: 'unknown', measurement: null });
  await open(page, 320, context);
  for (const preterm of ['unknown', 'yes']) {
    for (const measurement of [null, { value: null, unit: 'ng/mL' }, { value: '', unit: 'ng/mL' },
      { value: -1, unit: 'ng/mL' }, { value: 2, unit: 'ng/mL', operator: '<' },
      { value: 2, unit: 'ng/mL', operator: '>' }]) {
      await update(page, { ...context, preterm, measurement });
      await expect(point(page)).toHaveCount(0);
      await expect(caption(page)).not.toHaveText(message);
    }
  }
  // A real zero is a numeric result, not an empty field.
  await update(page, { ...context, measurement: { value: 0, unit: 'ng/mL' } });
  await expect(caption(page)).toHaveText(message);
  await update(page, context);
  await expect(caption(page)).not.toHaveText(message);
});

test('the AMH-only explanation preserves other analytes and the existing comparison message', async ({ page }) => {
  const context = infant('female', { preterm: 'unknown' });
  await open(page, 1440, context);
  for (const [analyte, unit] of [['inhibin_b', 'pg/mL'], ['lh', 'IU/L'], ['fsh', 'IU/L'], ['estradiol', 'pmol/L']]) {
    await update(page, { ...context, analyte, measurement: { value: 2, unit } });
    await expect(caption(page)).not.toHaveText(message);
  }
  await update(page, context);
  await panel(page).locator('[data-view="mini"]').click();
  await panel(page).getByRole('button', { name: 'Porównaj płcie', exact: true }).click();
  await expect(panel(page).locator('[data-lifespan="insight-text"]')).toHaveText(message);
  await expect(caption(page)).not.toHaveText(message);
  await expect(point(page)).toHaveCount(0);
  await panel(page).getByRole('button', { name: 'Zakończ porównanie', exact: true }).click();
  await expect(caption(page)).toHaveText(message);
});
