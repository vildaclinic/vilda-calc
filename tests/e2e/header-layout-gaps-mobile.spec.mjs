import { expect, test } from '@playwright/test';
import { LAYOUT_ROUTES, prepareLayoutRoute, headerLayout, expectBell, expectReachableFooter } from '../support/header-layout-fixture.mjs';
import { emulatePhone, expectLandscape } from '../support/telefon-poziomo.mjs';

test.use({ serviceWorkers: 'block', reducedMotion: 'reduce' });
test.setTimeout(150_000);

// Start's native Search/card/return flow is already exercised in
// header-search-menu-mobile. These routes cover the other real form layouts.
for (const shell of [false, true]) for (const route of LAYOUT_ROUTES.slice(1)) {
  test(`${shell ? 'shell' : 'standalone'} ${route.title}: neutral mobile actions and usable content through resize and rotation`, async ({ page }, testInfo) => {
    const { owner, ids } = await prepareLayoutRoute(page, shell, route);
    const before = await owner.evaluate(id => window.VildaVault.getPatient(id), ids.a);
    const proof = [];
    for (const [width, height] of [[320, 852], [390, 852], [658, 1000], [844, 390], [390, 852]]) {
      await emulatePhone(page, { width, height });
      await expectLandscape(page, width > height);
      await expectLandscape(owner, width > height);
      await owner.evaluate(() => scrollTo({ top: 0, behavior: 'instant' }));
      await expectBell(page);
      const controls = page.locator('[data-vilda-chrome-menu-btn], #vildaHeaderSearchBtn, #vildaRemindersBtn');
      await expect(controls).toHaveCount(3);
      for (const control of await controls.all()) {
        await expect(control).toBeVisible();
        await expect(control).toHaveCSS('width', '44px');
        await expect(control).toHaveCSS('height', '44px');
        await expect(control.locator('svg')).toHaveCSS('width', '21px');
        await expect(control.locator('svg')).toHaveCSS('height', '21px');
      }
      await expect(page.locator('#vildaHeaderSearchInput')).toBeHidden();
      await expect.poll(async () => {
        // Rotation may legitimately restore a small prior scroll offset. Measure
        // the document's gutter independently of that preserved viewport state.
        const g = await headerLayout(page); return Math.round(g.topCard.y + g.embeddedScrollY - g.header.bottom);
      }, { message: 'the first actual content block starts 12px below the mobile header' }).toBe(12);
      const g = await headerLayout(page); proof.push(g);
      expect(g.hostOverflow).toBeLessThanOrEqual(1);
      expect(g.contentOverflow).toBeLessThanOrEqual(1);
      const targets = await controls.evaluateAll(nodes => nodes.map(node => {
        const r = node.getBoundingClientRect(); return { x: r.x, y: r.y, right: r.right, bottom: r.bottom };
      }));
      for (let i = 0; i < targets.length - 1; i++) expect(targets[i].right).toBeLessThanOrEqual(targets[i + 1].x);
      expect(Math.max(...targets.map(r => r.y)) - Math.min(...targets.map(r => r.y))).toBeLessThanOrEqual(1);
      const field = route.route === 'klirens' ? owner.getByRole('combobox', { name: 'Filtruj formuły', exact: true }) : owner.locator('#lastName');
      await field.click(); await expect(field).toBeFocused(); await field.blur();
      await expectReachableFooter(page, owner);
      await expect.poll(async () => {
        const current = await headerLayout(page); return Math.round(current.footer.y - current.last.bottom);
      }, { message: `${width}px: final rendered content ends 12px before the mobile footer` }).toBe(12);
    }
    expect(await owner.evaluate(id => window.VildaVault.getPatient(id), ids.a), 'rotation does not write patient data').toEqual(before);
    await testInfo.attach('mobile-real-layout.json', { body: JSON.stringify(proof, null, 2), contentType: 'application/json' });
  });
}
