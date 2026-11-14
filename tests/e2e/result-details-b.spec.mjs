import { test, expect } from '../support/test-czas.mjs';
import { prepareM1, pointViewport, expectSameViewport } from '../support/lab-chart-m1.mjs';

// A wide touch viewport must keep the two-step touch contract too. A width-only
// mobile rule would pass the narrow-phone regressions and still break on iPad.
test.use({ serviceWorkers: 'block', hasTouch: true });

test('wide touch: M1 selects only; explicit lab and clearance Details return to the chart; privacy and lock dispose the viewer without writes', async ({ page }) => {
  const { ids, notes, before, section } = await prepareM1(page, 1024);
  const bubble = page.locator('.vilda-lab-point-preview-bubble');
  const sharedDialog = page.locator('dialog.vilda-result-details-dialog[open]');
  for (const [id, value, detailId] of [[ids.above, '5,6', 'labResultDetailsDialog'], [ids.renal, /[-−]12/, 'detailsDialog']]) {
    if (id === ids.renal) await section.locator('.vilda-lab-hist-panel-select').selectOption('renal');
    const point = section.locator(`.vilda-lab-result-chart-point[data-note-id="${id}"]`);
    await point.scrollIntoViewIfNeeded();
    const position = await pointViewport(point);
    await point.tap();
    await expect(bubble.locator('strong')).toHaveText(value);
    await expect(point).toHaveAttribute('aria-pressed', 'true');
    await expect(sharedDialog).toHaveCount(0);
    expectSameViewport(position, await pointViewport(point));
    await point.locator('xpath=ancestor::article[1]').locator('.vilda-lab-hist-chart-details').tap();
    const details = page.locator('#' + detailId);
    await expect(details).toBeVisible();
    await expect(details).toHaveClass(/vilda-result-details-dialog/);
    expectSameViewport(position, await pointViewport(point));
    await details.getByRole('button', { name: detailId === 'detailsDialog' ? 'Zamknij' : 'Zamknij szczegóły wyniku', exact: true }).tap();
    await expect(sharedDialog).toHaveCount(0);
    expectSameViewport(position, await pointViewport(point));
    await expect(point).toHaveAttribute('aria-pressed', 'true');
    if (id === ids.renal) await expect(section.locator('.vilda-lab-hist-panel-select')).toHaveValue('renal');
  }
  expect(await notes()).toBe(before);

  await section.locator('.vilda-lab-hist-panel-select').selectOption('all');
  const point = section.locator(`.vilda-lab-result-chart-point[data-note-id="${ids.above}"]`);
  await point.scrollIntoViewIfNeeded();
  await point.tap();
  await point.locator('xpath=ancestor::article[1]').locator('.vilda-lab-hist-chart-details').tap();
  await expect(sharedDialog).toHaveCount(1);
  await section.evaluate(host => host.setAttribute('aria-hidden', 'true'));
  await expect(sharedDialog).toHaveCount(0);
  await expect(bubble).toHaveCount(0);
  await section.evaluate(host => host.removeAttribute('aria-hidden'));

  await point.tap();
  await point.locator('xpath=ancestor::article[1]').locator('.vilda-lab-hist-chart-details').tap();
  await expect(sharedDialog).toHaveCount(1);
  expect(await notes()).toBe(before);
  await page.evaluate(() => window.VildaVault.lock('manual'));
  await expect(sharedDialog).toHaveCount(0);
  await expect(bubble).toHaveCount(0);
});
