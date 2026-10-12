import { expect, test } from '../support/test-czas.mjs';

test.use({ serviceWorkers: 'block', reducedMotion: 'reduce' });

const panel = page => page.locator('.vilda-hormone-lifespan');
const chart = page => panel(page).locator('[data-lifespan="chart"]');
const description = page => chart(page).locator('[data-lifespan="chart-desc"]');
const point = (page, id) => chart(page).locator(`[data-patient-concentration="${id}"]`);
const currentSource = page => panel(page).locator('[data-lifespan="source-copy"] p')
  .filter({ hasText: 'Odniesienie dla tego wyniku:' });

// Mount the real component with every source dependency. A missing reference or
// display engine would exercise a fallback instead of the audited copy paths.
async function openComponent(page, width, context) {
  await page.setViewportSize({ width, height: 1000 });
  await page.route('**/__test-hormone-audit-copy', route => route.fulfill({
    contentType: 'text/html',
    body: `<!doctype html><html lang="pl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
      <link rel="stylesheet" href="/ios26-v2.css"><link rel="stylesheet" href="/style.css">
      <link rel="stylesheet" href="/vilda_hormone_lifespan.css">
      <style>body{display:block;margin:0}main{width:100%;box-sizing:border-box}</style></head>
      <body><main id="diagram"></main><script src="/vilda_hormone_lifespan_data.js"></script>
      <script src="/vilda_hormone_lifespan_reference.js"></script>
      <script src="/vilda_hormone_lifespan_display.js"></script>
      <script src="/vilda_hormone_lifespan_observations.js"></script>
      <script src="/vilda_hormone_lifespan.js"></script></body></html>`,
  }));
  await page.goto('/__test-hormone-audit-copy', { waitUntil: 'load' });
  await page.evaluate(() => {
    window.auditCopyChart = window.VildaHormoneLifespan.mount({ host: document.querySelector('#diagram') });
  });
  await update(page, context);
  await expect(panel(page)).toBeVisible();
}

async function update(page, context) {
  await page.evaluate(context => {
    // Retain the supplied object, including nested clinical facts, so rendering
    // and controls can be checked for unintended changes to the caller's input.
    window.auditCopyInput = context;
    window.auditCopyChart.update(window.auditCopyInput);
  }, context);
}

async function expectInputPreserved(page, context) {
  expect(await page.evaluate(() => window.auditCopyInput)).toEqual(context);
}

async function expectAmhDescription(page) {
  await expect(chart(page)).toHaveAccessibleName(/AMH: przebieg zmian u dziewczynek i chłopców w pokwitaniu/);
  await expect(chart(page).locator('[data-comparison-curve="amh"]')).toHaveCount(2);
  const copy = await description(page).textContent();
  expect.soft(copy).toContain('AMH');
  expect.soft(copy).not.toMatch(/inhibin/i);
  await expect(description(page)).toContainText('8 do 20 lat');
  await expect(description(page)).toContainText('Przecięcie linii nie oznacza równych stężeń');
}

async function expectReadyMean(page, id) {
  await expect(point(page, id)).toHaveCount(1);
  await expect(point(page, id)).toHaveAttribute('data-value', '4.5');
  await expect(point(page, id)).toHaveAccessibleName(/Wynik pacjenta: 4,5 IU\/L\. Średnia w grupie 18–25 lat: około 3 IU\/L\./);
  await expect(point(page, id)).toHaveAttribute('data-reference-value', '3');
  await expect(point(page, id)).toHaveAttribute('data-reference-statistic', 'group-mean');
  await expect(point(page, id)).toHaveAttribute('data-profile', `laurentino2020-male-${id}-18-under25`);
  await expect(point(page, id).locator('[data-dot-label="median"]')).toHaveText('Średnia grupy ≈3 IU/L');
  await expect(point(page, id).locator('[data-result-point]')).toHaveCount(1);
  await expect(currentSource(page)).toContainText('Laurentino');
  await expect(currentSource(page)).toContainText('średnia grupy 18–25 lat');
  await expect(currentSource(page)).not.toContainText(/median/i);
  await expect(panel(page).locator('[data-lifespan="scale-note"]')).toContainText('średnia grupy');
}

for (const width of [1440, 320]) {
  test(`HM4 puberty comparison description follows AMH and hormone switching at ${width}px`, async ({ page }) => {
    const context = {
      analyte: 'amh', sex: 'female', ageYears: 14, ageLabel: '14 lat', preterm: 'no',
      sourceStatus: 'ready', identityKey: 'fictional-audit-copy-puberty',
    };
    await openComponent(page, width, context);
    await panel(page).locator('[data-view="puberty"]').click();
    await panel(page).getByRole('button', { name: 'Porównaj płcie', exact: true }).click();
    await expectAmhDescription(page);

    for (const [id, name, axis, ages] of [
      ['lh', 'LH', '0 do 8 IU/L', '6 do 16 lat'],
      ['fsh', 'FSH', '0 do 8 IU/L', '6 do 16 lat'],
      ['inhb', 'Inhibina B', '0 do 400 pg/mL', '8 do 20 lat'],
    ]) {
      await panel(page).locator(`[data-hormone="${id}"]`).click();
      await expect(panel(page).locator('[data-hormone][aria-pressed="true"]')).toHaveCount(1);
      await expect(panel(page).locator(`[data-hormone="${id}"]`)).toHaveAttribute('aria-pressed', 'true');
      await expect(chart(page)).toHaveAccessibleName(new RegExp(`${name} u dziewczynek i chłopców w pokwitaniu`));
      await expect(chart(page).locator(`[data-comparison-curve="${id}"]`)).toHaveCount(2);
      await expect(description(page)).toContainText(axis);
      await expect(description(page)).toContainText(ages);
      await expect(description(page)).toContainText('mediany modeli wieku');
      await expect(description(page)).not.toContainText(/AMH|własne maksimum|żeńska inhibina B/);
    }

    await panel(page).locator('[data-hormone="amh"]').click();
    await expectAmhDescription(page);
    await panel(page).getByRole('button', { name: 'Powiększ', exact: true }).click();
    await expect(page.locator('dialog.vhl-fullscreen-dialog')).toBeVisible();
    await expectAmhDescription(page);
    await page.keyboard.press('Escape');
    await expectInputPreserved(page, context);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  });

  for (const id of ['lh', 'fsh']) {
    test(`HM5 ${id} unavailable copy keeps young-adult reference terminology at ${width}px`, async ({ page }) => {
      const context = {
        analyte: id, sex: 'male', ageYears: 22, ageUpperYears: 22, ageUpperInclusive: true,
        ageLabel: '22 lata', preterm: 'no', sourceStatus: 'ready',
        identityKey: `fictional-audit-copy-${id}`, measurement: { value: 4.5, unit: 'IU/L' },
        specimen: 'serum', assayMethodId: 'unknown', contraindicated: false,
        puberty: { kind: 'G', stage: 5 },
      };
      await openComponent(page, width, context);
      await panel(page).getByText('O wykresie i źródła', { exact: true }).click();
      await expectReadyMean(page, id);
      await expectInputPreserved(page, context);

      for (const [patch, reason, explanation] of [
        [{ assayMethodId: 'anshlite-lh' }, 'incompatible-assay', 'potwierdzonej metody'],
        [{ specimen: 'plasma' }, 'incompatible-specimen', 'materiału tej próbki'],
      ]) {
        const unavailable = { ...context, ...patch };
        await update(page, unavailable);
        // Verify why the actual production engine refused this input before
        // asserting the visible explanation; absence of a point alone is weak.
        expect(await page.evaluate(() => window.VildaHormoneLifespanReference.evaluate(
          window.VildaHormoneLifespanData.patientPointData, window.auditCopyInput,
        ))).toEqual({ status: 'unavailable', reason });
        await expect(point(page, id)).toHaveCount(0);
        await expect(currentSource(page)).toHaveCount(0);
        const note = panel(page).locator('[data-lifespan="scale-note"]');
        await expect(note).toBeVisible();
        await expect(note).toContainText(explanation);
        let copy = await note.textContent();
        expect.soft(copy).toMatch(/wartoś(?:ć|ci) odniesienia/i);
        expect.soft(copy).not.toMatch(/median/i);
        await panel(page).getByRole('button', { name: 'Powiększ', exact: true }).click();
        await expect(page.locator('dialog.vhl-fullscreen-dialog')).toBeVisible();
        await expect(note).toBeVisible();
        copy = await note.textContent();
        expect.soft(copy).toMatch(/wartoś(?:ć|ci) odniesienia/i);
        expect.soft(copy).not.toMatch(/median/i);
        await page.keyboard.press('Escape');
        await expectInputPreserved(page, unavailable);

        await update(page, context);
        await expectReadyMean(page, id);
        await expectInputPreserved(page, context);
      }
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    });
  }
}
