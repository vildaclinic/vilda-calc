import { expect, test } from '@playwright/test';
import { GLOBAL_QUERY, SEARCH_WORKSPACE, globalSearchFixture, openGlobalSearch, queryGlobal, resultFor } from '../support/global-search-fixture.mjs';

test.use({ serviceWorkers: 'block', reducedMotion: 'reduce' });
test.setTimeout(180000);

test('mobile Search separates the compact toolbar into two rows and restores query, filters, selection and list scroll after preview', async ({ page }) => {
  const created = await globalSearchFixture(page);
  const search = await openGlobalSearch(page);
  const query = search.getByRole('searchbox', { name: GLOBAL_QUERY, exact: true });
  const time = search.getByRole('combobox', { name: 'Terminy spraw', exact: true });
  const status = search.getByRole('combobox', { name: 'Stan spraw', exact: true });
  const [queryBox, timeBox, statusBox] = await Promise.all([query.boundingBox(), time.boundingBox(), status.boundingBox()]);
  expect(timeBox.y).toBeGreaterThanOrEqual(queryBox.y + queryBox.height);
  expect(Math.abs(timeBox.y - statusBox.y)).toBeLessThan(2);
  await queryGlobal(search, 'NoWaK');
  await time.selectOption('future'); await status.selectOption('open');
  const selected = resultFor(search, 'note', created.notes.mri);
  await expect(selected).toBeVisible();
  await selected.scrollIntoViewIfNeeded();
  const scroll = await search.locator('.vgs-list').evaluate(node => node.scrollTop);
  await selected.tap();
  await expect(search.locator('.vgs-list-pane')).toBeHidden();
  await expect(search.locator('.vgs-detail')).toBeVisible();
  await expect(search.locator('.vb22-detail-title')).toHaveText('Fikcyjny rezonans przysadki');
  await expect(search.locator('.vb22-body')).toHaveText('Fikcyjny przyszły termin rezonansu.');
  await search.getByRole('button', { name: '← Wyniki wyszukiwania', exact: true }).tap();
  await expect(search.locator('.vgs-list-pane')).toBeVisible();
  await expect(query).toHaveValue('NoWaK'); await expect(time).toHaveValue('future'); await expect(status).toHaveValue('open');
  await expect(selected).toHaveAttribute('aria-current', 'true');
  expect(await search.locator('.vgs-list').evaluate(node => node.scrollTop)).toBeCloseTo(scroll, 0);
  for (const width of [390, 720, 768, 1024]) {
    await page.setViewportSize({ width, height: 852 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    expect(await search.evaluate(node => node.scrollWidth <= node.clientWidth + 1)).toBe(true);
  }
});

test('mobile privacy covers Search results including query and filters, and locking clears the decrypted workspace', async ({ page }) => {
  const created = await globalSearchFixture(page);
  const search = await openGlobalSearch(page), workspace = page.locator(SEARCH_WORKSPACE);
  await queryGlobal(search, 'Nowak');
  await expect(resultFor(search, 'patient', created.ids.a)).toBeVisible();
  await workspace.getByRole('button', { name: 'Ukryj treść Przypomnień', exact: true }).tap();
  await expect(workspace.locator('.vilda-reminders-private-cover')).toBeVisible();
  await expect(search).toBeHidden();
  expect(await search.evaluate(node => {
    const part = node.closest('.vb22-private-content');
    return part && part.inert && part.getAttribute('aria-hidden') === 'true';
  })).toBe(true);
  await workspace.getByRole('button', { name: 'Pokaż treść Przypomnień', exact: true }).tap();
  await expect(search.getByRole('searchbox', { name: GLOBAL_QUERY, exact: true })).toHaveValue('Nowak');
  await expect(resultFor(search, 'patient', created.ids.a)).toBeVisible();
  await page.evaluate(() => window.VildaVault.lock('manual'));
  await expect(workspace).toHaveCount(0);
  await expect(page.locator('.vgs')).toHaveCount(0);
  await expect(page.locator('.vgs-query')).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
});
