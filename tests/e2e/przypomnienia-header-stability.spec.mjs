import { expect, test } from '../support/test-czas.mjs';
import { GLOBAL_QUERY, SEARCH_WORKSPACE, queryGlobal, resultFor } from '../support/global-search-fixture.mjs';
import {
  addHeaderReminders, expectCompactPlans, expectCompactTodo, expectDirectNewPlan, expectHeaderGeometry,
  expectHeaderReadPending, expectNoOverflow, headerFixture, headerGeometry, holdHeaderRead, nativePlaceholderStart,
  openReminders, releaseHeaderRead, selectHeaderTab,
} from '../support/reminders-header-fixture.mjs';

test.use({ chwila: '2026-10-29T10:00:00+01:00', serviceWorkers: 'block', reducedMotion: 'reduce' });
test.setTimeout(180000);

test('full Reminders keep their real header slots through counts, loading and Search while Plan/Search text starts coincide', async ({ page }) => {
  const created = await headerFixture(page), workspace = await openReminders(page);
  const count = workspace.locator('.vb22-tab-count');
  const initial = Number(await count.textContent()); expect(initial).toBeLessThanOrEqual(9);
  await addHeaderReminders(created.frame, created.ids.a, 9 - initial);
  await expect(count).toHaveText('9');
  const before = await headerGeometry(workspace);
  await expect(workspace.locator('.vb22-primary-create .vb22-create-label')).toHaveText('Dodaj +');
  await addHeaderReminders(created.frame, created.ids.a, 1);
  await expect(count).toHaveText('10'); await expectHeaderGeometry(workspace, before);

  await holdHeaderRead(page, 'listCarePlans');
  await selectHeaderTab(workspace, 'plans');
  const panel = workspace.locator('.vcp-reminders-layout');
  await expect(panel.locator('.vcp-list [role=status]')).toHaveText('Wczytywanie planów…');
  await expectHeaderReadPending(page);
  await expectHeaderGeometry(workspace, before);
  await releaseHeaderRead(page);
  await expect(panel.locator(`[data-plan-id="${created.planId}"]`)).toBeVisible();
  await expect(workspace.locator('.vb22-primary-create .vb22-create-label')).toHaveText('Nowy plan');
  const primary = await workspace.locator('.vb22-primary-create').boundingBox();
  const templates = workspace.locator('.vb22-template-open'); await expect(templates).toHaveText('Moje szablony');
  const templateBox = await templates.boundingBox();
  expect(templateBox.y).toBeCloseTo(primary.y, 1); expect(templateBox.height).toBe(44);
  expect(primary.x + primary.width).toBeLessThanOrEqual(templateBox.x);
  const planQuery = panel.locator('.vcp-search'); await expect(planQuery).toBeVisible();
  const planBox = await planQuery.boundingBox();
  const planText = await nativePlaceholderStart(page, `${SEARCH_WORKSPACE} .vcp-search`);

  await holdHeaderRead(page, 'listAllPatientNotes');
  await selectHeaderTab(workspace, 'search');
  const search = workspace.locator('.vgs');
  const query = search.getByRole('searchbox', { name: GLOBAL_QUERY, exact: true });
  // Global Search deliberately waits for a query before decrypting its index.
  await query.fill('Fikcyjny');
  await expect(search).toHaveAttribute('aria-busy', 'true');
  await expectHeaderReadPending(page);
  await expectHeaderGeometry(workspace, before);
  await releaseHeaderRead(page); await expect(search).toHaveAttribute('aria-busy', 'false');
  await query.fill(''); await expect(search).toHaveAttribute('aria-busy', 'false');
  const searchBox = await query.boundingBox(), searchText = await nativePlaceholderStart(page, `${SEARCH_WORKSPACE} .vgs-query`);
  for (const [actual, expected] of [[searchBox.x, planBox.x], [searchBox.y, planBox.y], [searchText.x, planText.x], [searchText.inset, planText.inset]]) {
    expect(Math.abs(actual - expected), 'visible query boxes and native placeholder starts share an edge').toBeLessThanOrEqual(0.25);
  }
  expect(searchBox.height).toBe(44); expect(planBox.height).toBe(44);
  await expect(workspace.locator('.vb22-primary-create .vb22-create-label')).toHaveText('Dodaj +');
  await expect(templates).toBeHidden();
  await queryGlobal(search, 'rezonans');
  await search.getByRole('combobox', { name: 'Daty wpisów', exact: true }).selectOption('future');
  await search.getByRole('combobox', { name: 'Stan spraw', exact: true }).selectOption('open');
  await expect(resultFor(search, 'note', created.notes.mri)).toBeVisible();
  await query.focus(); await expect(query).toBeFocused(); await expectHeaderGeometry(workspace, before);
  await selectHeaderTab(workspace, 'plans'); await selectHeaderTab(workspace, 'search');
  await expect(query).toHaveValue('rezonans');
  await expect(search.getByRole('combobox', { name: 'Daty wpisów', exact: true })).toHaveValue('future');
  await expect(search.getByRole('combobox', { name: 'Stan spraw', exact: true })).toHaveValue('open');
  await expectHeaderGeometry(workspace, before); await expectNoOverflow(page, workspace);

  // A query entered while its local field is visible must remain recoverable
  // after resizing to the accepted compact layout that hides that field.
  await selectHeaderTab(workspace, 'active');
  const todoQuery = workspace.locator('.vb22-list-tools .vb22-search');
  const todoRows = workspace.locator('.vb22-list [data-note-id]');
  const total = await todoRows.count(); expect(total).toBeGreaterThan(0);
  await todoQuery.fill('Fikcyjny nieistniejący wpis nagłówka');
  await expect(todoRows).toHaveCount(0);
  await page.setViewportSize({ width: 390, height: 852 });
  await expect(todoQuery).toBeHidden();
  const clearTodo = workspace.getByRole('button', { name: 'Wyczyść szukanie', exact: true });
  await expect(clearTodo).toBeVisible(); await clearTodo.click();
  await expect(todoQuery).toHaveValue(''); await expect(todoRows).toHaveCount(total);
  await expect(clearTodo).toBeHidden(); await expectNoOverflow(page, workspace);

  await page.setViewportSize({ width: 1440, height: 1000 });
  await selectHeaderTab(workspace, 'plans');
  await expect(planQuery).toBeVisible(); await planQuery.fill('Fikcyjny nieistniejący plan nagłówka');
  await panel.getByRole('button', { name: /^Zamknięte, liczba planów:/ }).click();
  await expect(panel.locator('[data-plan-id]')).toHaveCount(0);
  await page.setViewportSize({ width: 390, height: 852 });
  await expect(planQuery).toBeHidden(); await expect(panel.locator('.vcp-filters')).toBeHidden();
  const clearPlans = panel.getByRole('button', { name: 'Wyczyść filtry', exact: true });
  await expect(clearPlans).toBeVisible(); await clearPlans.click();
  await expect(planQuery).toHaveValue('');
  await expect(panel.locator('.vcp-filters button').filter({ hasText: 'Otwarte' })).toHaveAttribute('aria-pressed', 'true');
  await expect(panel.locator(`[data-plan-id="${created.planId}"]`)).toBeVisible();
  await expect(clearPlans).toHaveCount(0); await expect(panel.locator('.vcp-list')).toBeFocused();
  await expectNoOverflow(page, workspace);
});

test('real inline cards stay compact at actual desktop column widths and their plus opens a plan directly', async ({ page }) => {
  await headerFixture(page);
  const card = page.locator('#remindersInline .vb22-inline');
  for (const width of [1024, 1440, 1920]) {
    await page.setViewportSize({ width, height: 1000 });
    await expect(card).toBeVisible(); await card.scrollIntoViewIfNeeded();
    await card.evaluate(() => document.fonts.ready);
    await selectHeaderTab(card, 'active'); const before = await headerGeometry(card);
    await expectCompactTodo(card);
    await selectHeaderTab(card, 'plans'); await expectCompactPlans(card); await expectHeaderGeometry(card, before);
    await expectDirectNewPlan(page, card);
    const expanded = page.locator(SEARCH_WORKSPACE);
    await expect(expanded).toBeVisible();
    await expanded.getByRole('button', { name: 'Zamknij Przypomnienia', exact: true }).click();
    await expectHeaderGeometry(card, before);
    await selectHeaderTab(card, 'search'); await expect(card.locator('.vgs-query')).toBeVisible();
    await expectHeaderGeometry(card, before); await expectNoOverflow(page, card);
  }
});
