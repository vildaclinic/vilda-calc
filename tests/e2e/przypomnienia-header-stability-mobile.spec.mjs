import { expect, test } from '../support/test-czas.mjs';
import { GLOBAL_QUERY, queryGlobal, resultFor } from '../support/global-search-fixture.mjs';
import { mutatePlan } from '../support/care-plans-fixture.mjs';
import { TEMPLATE_ROOT, templateFixture } from '../support/care-templates-fixture.mjs';
import { persistedSearchFingerprint } from '../support/search-return-browser-fixture.mjs';
import {
  addHeaderReminders, expectCompactPlans, expectCompactTodo, expectDirectNewPlan, expectHeaderGeometry,
  expectNoOverflow, headerFixture, headerGeometry, openReminders, searchControlGeometry, selectHeaderTab,
} from '../support/reminders-header-fixture.mjs';

test.use({ chwila: '2026-10-29T10:00:00+01:00', serviceWorkers: 'block', reducedMotion: 'reduce' });
test.setTimeout(180000);

for (const width of [320, 390]) test(`mobile ${width}: the existing ToDo tiles and direct plan/template actions retain the compact header`, async ({ page }) => {
  await page.setViewportSize({ width, height: 852 });
  const created = await templateFixture(page);
  await addHeaderReminders(created.frame, created.ids.a, 8);
  await created.frame.evaluate(patientId => window.VildaVault.savePatientNote({
    patientId, title: 'Fikcyjne zadanie na dziś', category: 'reminder-task', dueDateISO: '2026-10-29',
  }), created.ids.a);
  const workspace = await openReminders(page), before = await headerGeometry(workspace);
  await expectCompactTodo(workspace);
  for (const [filter, count] of [['all', '9'], ['overdue', '8'], ['today', '1'], ['pending', '0']]) {
    await expect(workspace.locator(`[data-filter="${filter}"] .vb22-count`)).toHaveText(count);
  }
  await workspace.locator('[data-filter=today]').focus(); await page.keyboard.press('Enter');
  await expect(workspace.locator('[data-filter=today]')).toBeFocused();
  await expectHeaderGeometry(workspace, before);
  await selectHeaderTab(workspace, 'plans');
  const panel = await expectCompactPlans(workspace), templates = panel.locator('.vcp-template-button');
  await expect(panel.locator('.vcp-list .vcp-empty')).toContainText('Nie masz jeszcze planów');
  const fingerprint = await persistedSearchFingerprint(created.frame, created.ids.a);
  await expectDirectNewPlan(page, workspace);
  await expectHeaderGeometry(workspace, before);
  await templates.click();
  const library = page.locator(TEMPLATE_ROOT); await expect(library).toBeVisible();
  await library.getByRole('button', { name: 'Zamknij bibliotekę szablonów', exact: true }).click();
  await expect(library).toHaveCount(0); await expect(templates).toBeFocused();
  expect(await persistedSearchFingerprint(created.frame, created.ids.a)).toBe(fingerprint);

  for (let index = 0; index < 6; index++) await mutatePlan(created.frame, created.ids.a, null, 'create', {
    title: `Fikcyjny plan przewijania nagłówka ${index}`, goal: 'Fikcyjny plan organizacyjny testu układu.',
  });
  await expect(panel.locator('[data-plan-id]')).toHaveCount(6);
  const list = panel.locator('.vcp-list');
  await list.evaluate(node => { node.scrollTop = 0; });
  await expect(templates).toBeInViewport({ ratio: 1 });
  const top = await templates.boundingBox();
  await list.evaluate(node => { node.scrollTop = 120; });
  const scroll = await list.evaluate(node => node.scrollTop); expect(scroll).toBeGreaterThan(0);
  expect((await templates.boundingBox()).y).toBeCloseTo(top.y - scroll, 0);
  await expectHeaderGeometry(workspace, before);
  await list.evaluate(node => { node.scrollTop = 0; });
  await workspace.locator('[data-tab=plans]').focus(); await page.keyboard.press('Tab'); await page.keyboard.press('Tab');
  await expect(templates).toBeFocused();
  await selectHeaderTab(workspace, 'search');
  const search = workspace.locator('.vgs'); await expect(search).toHaveAttribute('aria-busy', 'false');
  const controls = await searchControlGeometry(search);
  await test.info().attach('search-control-geometry', { body: JSON.stringify(controls, null, 2), contentType: 'application/json' });
  expect(controls).toHaveLength(3);
  for (const control of controls) {
    expect(control.height).toBe(44);
    if (control.tag === 'SELECT') {
      expect(control.textWidth, `${control.text} stays clear of the arrow`).toBeLessThanOrEqual(control.available);
      expect(control.appearance).toBe('none'); expect(control.background).toContain('svg'); expect(control.position).toContain('14px');
    }
  }
  await expectHeaderGeometry(workspace, before); await expectNoOverflow(page, workspace);
});

test('mobile privacy and switching real tabs preserve Search query, filters, focus and header geometry', async ({ page }) => {
  const created = await headerFixture(page), workspace = await openReminders(page), before = await headerGeometry(workspace);
  await selectHeaderTab(workspace, 'search'); const search = workspace.locator('.vgs');
  await queryGlobal(search, 'rezonans');
  const query = search.getByRole('searchbox', { name: GLOBAL_QUERY, exact: true });
  const time = search.getByRole('combobox', { name: 'Daty wpisów', exact: true });
  const status = search.getByRole('combobox', { name: 'Stan spraw', exact: true });
  await time.selectOption('future'); await status.selectOption('open');
  await expect(resultFor(search, 'note', created.notes.mri)).toBeVisible();
  await query.focus(); await page.keyboard.press('Tab'); await expect(time).toBeFocused();
  await page.keyboard.press('Tab'); await expect(status).toBeFocused();
  await expectHeaderGeometry(workspace, before);
  await workspace.getByRole('button', { name: 'Ukryj treść Przypomnień', exact: true }).tap();
  await expect(workspace.locator('.vilda-reminders-private-cover')).toBeVisible();
  await expect(search).toBeHidden();
  expect(await search.evaluate(node => {
    const part = node.closest('.vb22-private-content'); return Boolean(part?.inert && part.getAttribute('aria-hidden') === 'true');
  })).toBe(true);
  await expectHeaderGeometry(workspace, before);
  await workspace.getByRole('button', { name: 'Pokaż treść Przypomnień', exact: true }).tap();
  await selectHeaderTab(workspace, 'plans'); await expectCompactPlans(workspace);
  await selectHeaderTab(workspace, 'active'); await expectCompactTodo(workspace);
  await selectHeaderTab(workspace, 'search');
  await expect(query).toHaveValue('rezonans'); await expect(time).toHaveValue('future'); await expect(status).toHaveValue('open');
  await expect(resultFor(search, 'note', created.notes.mri)).toBeVisible();
  await expectHeaderGeometry(workspace, before); await expectNoOverflow(page, workspace);
});

test('landscape keeps local list controls compact and leaves a usable real list beside the stable header', async ({ page }) => {
  await page.setViewportSize({ width: 844, height: 390 }); await headerFixture(page);
  const workspace = await openReminders(page), before = await headerGeometry(workspace);
  await expect(workspace.locator('.vb22-list-tools .vb22-search')).toBeHidden();
  for (const tab of ['plans', 'search', 'active']) {
    await selectHeaderTab(workspace, tab); await expectHeaderGeometry(workspace, before);
    if (tab === 'plans') {
      const panel = workspace.locator('.vcp-reminders-layout');
      await expect(panel.locator('.vcp-search')).toBeHidden(); await expect(panel.locator('.vcp-filters')).toBeHidden();
      await expect(workspace.locator('.vb22-template-open')).toBeVisible();
      expect((await panel.locator('.vcp-list').boundingBox()).height).toBeGreaterThanOrEqual(110);
    } else if (tab === 'search') {
      const search = workspace.locator('.vgs');
      await expect(search.getByRole('searchbox', { name: GLOBAL_QUERY, exact: true })).toBeVisible();
      await expect(search.getByRole('combobox', { name: 'Daty wpisów', exact: true })).toBeVisible();
      await expect(search.getByRole('combobox', { name: 'Stan spraw', exact: true })).toBeVisible();
    }
  }
  await expectNoOverflow(page, workspace);
});
