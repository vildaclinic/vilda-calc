import { expect, test } from '@playwright/test';
import { GLOBAL_QUERY, SEARCH_WORKSPACE, globalSearchFixture, queryGlobal, resultFor } from '../support/global-search-fixture.mjs';
import { RETURN_TO_SEARCH, persistedSearchFingerprint } from '../support/search-return-browser-fixture.mjs';
import { createFictionalVault, loadPatient } from '../support/centile-live-fixture.mjs';
import { expectHeaderAlignment, expectBell, expectDesktopSearchControl } from '../support/header-layout-fixture.mjs';

test.use({ serviceWorkers: 'block', reducedMotion: 'reduce' });
test.setTimeout(120000);

const HEADER_SEARCH = '#vildaHeaderSearchBtn';
const MENU = 'aside.sidebar-v2 .sidebar-inner';
const closeSearch = page => page.locator(SEARCH_WORKSPACE).getByRole('button', {
  name: 'Zamknij Przypomnienia', exact: true,
}).click();

for (const shell of [false, true]) {
  test(`${shell ? 'shell' : 'standalone'}: header Search enters the existing search and restores its patient return`, async ({ page }) => {
    const created = await globalSearchFixture(page, { shell });
    const before = await persistedSearchFingerprint(created.frame, created.ids.a);
    const trigger = page.locator(HEADER_SEARCH);
    await expect(trigger).toBeVisible();
    await expect(page.locator('body > header input')).toHaveCount(0);
    await expect(page.locator(SEARCH_WORKSPACE)).toHaveCount(0);
    await trigger.click();
    const workspace = page.locator(SEARCH_WORKSPACE), search = workspace.locator('.vgs');
    await expect(search).toBeVisible();
    const query = search.getByRole('searchbox', { name: GLOBAL_QUERY, exact: true });
    await expect(query).toHaveValue('');
    await expect(query).toBeFocused();
    // The draft and clearing now belong to the actual Search workspace.
    await queryGlobal(search, 'Fikcyjne ustalenie do wyczyszczenia');
    await query.clear();
    await expect(query).toHaveValue('');
    await expect(query).toBeFocused();
    await closeSearch(page);
    await expect(trigger).toBeFocused();
    await trigger.click();
    await expect(query).toHaveValue('');
    await queryGlobal(search, 'badanie ambulatoryjne');
    await resultFor(search, 'note', created.notes.biopsy).click();
    await search.getByRole('button', { name: 'Otwórz w karcie pacjenta ↗', exact: true }).click();
    const card = page.locator('.vilda-auth-patient-card');
    await expect(card.locator(`[data-note-id="${created.notes.biopsy}"]`)).toBeVisible();
    await card.getByRole('button', { name: RETURN_TO_SEARCH, exact: true }).click();
    await expect(query).toHaveValue('badanie ambulatoryjne');
    await expect(search.locator('.vgs-title')).toHaveText('Fikcyjne badanie ambulatoryjne');
    await closeSearch(page);
    await expect(trigger).toBeFocused();
    expect(await persistedSearchFingerprint(created.frame, created.ids.a), 'search and preview do not write patient data').toBe(before);
  });

  test(`${shell ? 'shell' : 'standalone'}: privacy masks the Search draft and a real vault lock clears it`, async ({ page }) => {
    const created = await globalSearchFixture(page, { shell });
    const trigger = page.locator(HEADER_SEARCH);
    await trigger.click();
    const workspace = page.locator(SEARCH_WORKSPACE);
    const search = workspace.locator('.vgs');
    const query = search.getByRole('searchbox', { name: GLOBAL_QUERY, exact: true });
    await queryGlobal(search, 'Fikcyjny Nowak');
    await expect(resultFor(search, 'patient', created.ids.a)).toBeVisible();
    await workspace.getByRole('button', { name: 'Ukryj treść Przypomnień', exact: true }).click();
    await expect(query).toBeHidden();
    await expect(resultFor(search, 'patient', created.ids.a)).toBeHidden();
    await expect(workspace.locator('.vilda-reminders-private-cover')).toBeVisible();
    await expect(workspace).toHaveAccessibleName('Przypomnienia — treść ukryta');
    expect(await page.locator('body > header').evaluate(node => node.textContent.includes('Fikcyjny Nowak')
      || [...node.querySelectorAll('*')].some(child => [...child.attributes].some(attribute => attribute.value.includes('Fikcyjny Nowak'))))).toBe(false);
    await workspace.getByRole('button', { name: 'Pokaż treść Przypomnień', exact: true }).click();
    await expect(query).toBeVisible();
    await expect(query).toHaveValue('Fikcyjny Nowak');
    await expect(resultFor(search, 'patient', created.ids.a)).toBeVisible();
    await closeSearch(page);
    await created.frame.evaluate(() => window.VildaVault.lock('manual'));
    await expect(page.locator('body > header input')).toHaveCount(0);
    await expect(page.locator('#vildaRemindersBtn')).toBeHidden();
    for (const pro of await page.locator('[data-menu-pro]').all()) await expect(pro).toBeHidden();
    const auth = page.locator('#vilda-auth-ui-root');
    await auth.getByRole('button', { name: /Fikcyjny sejf testu panelu siatek/ }).click();
    await auth.locator('input[type=password]').fill('E2e#SiatkaNowyPomiar!2026');
    await auth.getByRole('button', { name: 'Zaloguj się', exact: true }).click();
    await page.waitForFunction(() => window.VildaVault?.isUnlocked() && window.VildaAuthUI?.isBootReady()
      && !document.documentElement.classList.contains('vilda-auth-locked'));
    await trigger.click();
    const emptyQuery = page.locator(`${SEARCH_WORKSPACE} .vgs`).getByRole('searchbox', { name: GLOBAL_QUERY, exact: true });
    await expect(emptyQuery).toHaveValue('');
    await expect(emptyQuery).toBeFocused();
  });
}

test('desktop and ultrawide: the lupa and bell follow the right card; save and cloud state remain separate', async ({ page }) => {
  const created = await createFictionalVault(page, { shell: true });
  await loadPatient(created.frame, created.ids.a, 'restore', { clear: true });
  const menu = page.locator(MENU), status = menu.locator('[data-menu-save-status]');
  await expect(status).toHaveAttribute('data-save-state', 'saved');
  await expect(status).toHaveText('Zapisano');
  await expect(menu.locator('[data-menu-pro]')).toBeVisible();
  await expect(menu.locator('[data-menu-sync]')).toBeVisible();
  await expect(menu.locator('[data-menu-patient-change]')).toHaveCount(0);
  await expect(menu.locator('[data-menu-patient-name]')).toHaveCSS('font-size', '18px');
  await expect(menu.locator('.chrome-menu-patient-copy small')).toHaveCSS('font-size', '16px');
  await expect(status).toHaveCSS('font-size', '16px');
  for (const id of ['vildaPatientChip', 'vildaUserChip', 'vildaProBadge']) {
    await expect(page.locator(`#${id}`), `${id} remains a hidden compatibility carrier`).toBeHidden();
  }
  for (const width of [992, 1024, 1440, 2560, 3440]) {
    await page.setViewportSize({ width, height: 1000 });
    // The same compact pair follows the workspace edge in one or two columns.
    await expectHeaderAlignment(page);
    await expectDesktopSearchControl(page);
    await expectBell(page);
    const actions = await menu.locator('.chrome-menu-save, .chrome-menu-documents').evaluateAll(nodes => nodes.map(node => {
      const r = node.getBoundingClientRect(); return { width: r.width, y: r.y };
    }));
    expect(actions).toHaveLength(2);
    expect(actions[0].width).toBeCloseTo(actions[1].width, 0);
    expect(actions[0].y).toBeCloseTo(actions[1].y, 0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
  }
  // Real sync events update the visible status; they must not recolor a saved
  // patient's separate save status or shift the Search/bell while warning appears.
  const geometry = () => page.locator('#vildaHeaderSearch, #vildaRemindersBtn').evaluateAll(nodes => nodes.map(node => {
    const r = node.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height };
  }));
  const before = await geometry();
  const neutralBell = await expectBell(page);
  await page.evaluate(() => document.dispatchEvent(new CustomEvent('vilda:sync-status-changed', { detail: { state: 'error' } })));
  await expect(page.locator('#vildaSyncBtn')).toBeVisible();
  await expect(status).toHaveAttribute('data-save-state', 'saved');
  await expect(status).toHaveText('Zapisano');
  expect(await geometry()).toEqual(before);
  expect(await expectBell(page)).toEqual(neutralBell);
  await page.evaluate(() => document.dispatchEvent(new CustomEvent('vilda:sync-status-changed', { detail: { state: 'ok' } })));
  await expect(page.locator('#vildaSyncBtn')).toBeHidden();
  expect(await geometry()).toEqual(before);
  expect(await expectBell(page)).toEqual(neutralBell);
  await created.frame.locator('#height').fill('157');
  await expect(status).toHaveAttribute('data-save-state', 'dirty');
  expect(await expectBell(page), 'patient save status does not recolor the reminders action').toEqual(neutralBell);
});
