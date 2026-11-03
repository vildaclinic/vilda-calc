import { expect, test } from '@playwright/test';
import { GLOBAL_QUERY, SEARCH_WORKSPACE, globalSearchFixture, queryGlobal, resultFor } from '../support/global-search-fixture.mjs';
import { RETURN_TO_SEARCH, persistedSearchFingerprint } from '../support/search-return-browser-fixture.mjs';
import { visibleChromeMenu, closeChromeMenu } from '../support/chrome-menu-fixture.mjs';
import { expectBell, headerLayout, expectReachableFooter } from '../support/header-layout-fixture.mjs';
import { emulatePhone, expectLandscape } from '../support/telefon-poziomo.mjs';

test.use({ serviceWorkers: 'block', reducedMotion: 'reduce' });
test.setTimeout(120000);

for (const shell of [false, true]) test(`${shell ? 'shell' : 'standalone'} phone: one-row header, native Search and return to the lupa`, async ({ page }) => {
  const created = await globalSearchFixture(page, { shell });
  const before = await persistedSearchFingerprint(created.frame, created.ids.a);
  for (const width of [320, 390, 658, 844]) {
    await page.setViewportSize({ width, height: 852 });
    await created.frame.evaluate(() => scrollTo({ top: 0, behavior: 'instant' }));
    await expect.poll(async () => {
      const g = await headerLayout(page); return Math.round(g.topCard.y + g.embeddedScrollY - g.header.bottom);
    }, { message: `${width}px: first real form card begins 12px below the mobile header` }).toBe(12);
    const controls = page.locator('[data-vilda-chrome-menu-btn], #vildaHeaderSearchBtn, #vildaRemindersBtn');
    await expectBell(page);
    await expect(controls).toHaveCount(3);
    for (const control of await controls.all()) {
      await expect(control).toBeVisible();
      const size = await control.boundingBox();
      expect(size.width).toBeGreaterThanOrEqual(44);
      expect(size.height).toBeGreaterThanOrEqual(44);
      // Preserve the icon's layout size; the existing hover transform can scale
      // its painted bounding box by 1.02 after closing the drawer on a touch UA.
      await expect(control.locator('svg')).toHaveCSS('width', '21px');
      await expect(control.locator('svg')).toHaveCSS('height', '21px');
    }
    const centers = await controls.evaluateAll(nodes => nodes.map(node => {
      const r = node.getBoundingClientRect(); return r.y + r.height / 2;
    }));
    expect(Math.max(...centers) - Math.min(...centers), `${width}px: all header actions share one row`).toBeLessThanOrEqual(1);
    for (const selector of ['#vildaHeaderSearchInput', '#vildaPatientChip', '#vildaUserChip', '#vildaProBadge']) {
      await expect(page.locator(selector)).toBeHidden();
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
    const menu = await visibleChromeMenu(page);
    await expect(menu.locator('.chrome-menu-save')).toBeVisible();
    await expect(menu.locator('.chrome-menu-documents')).toBeVisible();
    await expect(menu.locator('[data-menu-patient-card]')).toBeVisible();
    await expect(menu.locator('[data-menu-pro]')).toBeVisible();
    await expect(menu.locator('[data-menu-sync]')).toBeVisible();
    const actions = await menu.locator('.chrome-menu-save, .chrome-menu-documents').evaluateAll(nodes => nodes.map(node => {
      const r = node.getBoundingClientRect(); return { width: r.width, y: r.y };
    }));
    expect(actions[0].width).toBeCloseTo(actions[1].width, 0);
    expect(actions[0].y).toBeCloseTo(actions[1].y, 0);
    await closeChromeMenu(page);
    await expectReachableFooter(page, created.frame);
    await expect.poll(async () => {
      const g = await headerLayout(page); return Math.round(g.footer.y - g.last.bottom);
    }, { message: `${width}px: last real Start block ends 12px above the mobile footer` }).toBe(12);
  }
  await emulatePhone(page, { width: 844, height: 390 });
  await expectLandscape(page, true);
  await expectLandscape(created.frame, true);
  await expectBell(page);
  await expect(page.locator('#vildaHeaderSearchBtn')).toHaveCSS('width', '44px');
  await expect(page.locator('#vildaHeaderSearchBtn svg')).toHaveCSS('width', '21px');
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
  await emulatePhone(page, { width: 390, height: 852, safeArea: { top: 0, right: 0, bottom: 0, left: 0 } });
  await expectLandscape(page, false);
  await page.setViewportSize({ width: 390, height: 852 });
  const trigger = page.locator('#vildaHeaderSearchBtn');
  await trigger.click();
  const workspace = page.locator(SEARCH_WORKSPACE), search = workspace.locator('.vgs');
  await expect(search).toBeVisible();
  await expect(search.getByRole('searchbox', { name: GLOBAL_QUERY, exact: true })).toBeFocused();
  await queryGlobal(search, 'badanie ambulatoryjne');
  await resultFor(search, 'note', created.notes.biopsy).click();
  await search.getByRole('button', { name: 'Otwórz w karcie pacjenta ↗', exact: true }).click();
  await page.locator('.vilda-auth-patient-card').getByRole('button', { name: RETURN_TO_SEARCH, exact: true }).click();
  await expect(search.locator('.vgs-title')).toHaveText('Fikcyjne badanie ambulatoryjne');
  await expect(search.getByRole('searchbox', { name: GLOBAL_QUERY, exact: true })).toHaveValue('badanie ambulatoryjne');
  await workspace.getByRole('button', { name: 'Zamknij Przypomnienia', exact: true }).click();
  await expect(trigger).toBeFocused();
  expect(await persistedSearchFingerprint(created.frame, created.ids.a)).toBe(before);
});
