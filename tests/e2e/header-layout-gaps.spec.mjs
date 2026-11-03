import { expect, test } from '@playwright/test';
import { LAYOUT_ROUTES, prepareLayoutRoute, headerLayout, expectHeaderAlignment,
  expectBell, expectDesktopSearchControl, expectReachableFooter } from '../support/header-layout-fixture.mjs';
import { loadPatient } from '../support/centile-live-fixture.mjs';

test.use({ serviceWorkers: 'block', reducedMotion: 'reduce' });
test.setTimeout(180_000);

for (const shell of [false, true]) for (const route of LAYOUT_ROUTES) {
  test(`${shell ? 'shell' : 'standalone'} ${route.title}: real cards, 12px gaps, reserved right rail and aligned header survive resize`, async ({ page }, testInfo) => {
    const { owner, ids } = await prepareLayoutRoute(page, shell, route);
    if (route.route === 'docpro') {
      await expect(owner.locator('#currentSummaryCard')).toBeHidden();
      await expectHeaderAlignment(page); // Empty second track is a supported initial state.
      await expectReachableFooter(page, owner);
      await expect.poll(async () => {
        const g = await headerLayout(page); return Math.round(g.footer.y - g.last.bottom);
      }, { message: 'empty DocPro keeps its final module action 12px above the footer' }).toBe(12);
      await loadPatient(owner, ids.a, 'restore', { clear: true });
      await expect(owner.locator('#currentSummaryCard')).toBeVisible();
    }
    const record = await owner.evaluate(id => window.VildaVault.getPatient(id), ids.a);
    const proof = [];
    // Return through both breakpoints, rather than testing only fresh wide loads.
    for (const width of [1280, 1440, 1920, 2560, 3440, 1400, 1399, 1280]) {
      await page.setViewportSize({ width, height: 1000 });
      await owner.evaluate(() => scrollTo({ top: 0, behavior: 'instant' }));
      await expectHeaderAlignment(page);
      await expectBell(page);
      await expectDesktopSearchControl(page);
      await expect.poll(async () => {
        const g = await headerLayout(page);
        return {
          menuToCard: Math.round(g.first.x - g.menu.right),
          top: Math.round(g.topCard.y + g.embeddedScrollY - g.header.bottom),
          decorWidth: Math.round(g.decor?.width || 0),
          ...(width >= 1400 ? { toDecor: Math.round(g.decor.x - g.workspace.right) } : {}),
        };
      }, { message: `${width}px: measured visible card edges have the agreed spacing` })
        .toEqual({ menuToCard: 12, top: 12, decorWidth: width >= 1400 ? 230 : 0,
          ...(width >= 1400 ? { toDecor: 12 } : {}) });
      const geometry = await headerLayout(page);
      // Vertical clinical spacing is intentionally independent of the 12px
      // inter-column gutter, especially Klirens' clearing/result controls.
      if (geometry.second.x >= geometry.first.right - 1) {
        expect(geometry.second.x - geometry.first.right, 'the two actual card borders are 12px apart').toBeCloseTo(12, 0);
      }
      expect(geometry.hostOverflow).toBeLessThanOrEqual(1);
      expect(geometry.contentOverflow).toBeLessThanOrEqual(1);
      if (width >= 1400 && route.route !== 'docpro') {
        const rail = page.locator(shell ? '#vildaShellDecor' : '.desktop-layout > .decor-sidebar');
        expect(await rail.evaluate(node => [...node.children].filter(child => {
          const r = child.getBoundingClientRect();
          return r.width > 0 && r.height > 0 && getComputedStyle(child).visibility !== 'hidden';
        }).length), 'the rail reserves its full track even with no visible content').toBe(0);
      }
      const firstField = route.route === 'klirens' ? owner.getByRole('combobox', { name: 'Filtruj formuły', exact: true }) : owner.locator('#lastName');
      await firstField.click();
      await expect(firstField).toBeFocused();
      await firstField.blur();
      await expectReachableFooter(page, owner);
      await expect.poll(async () => {
        const g = await headerLayout(page); return Math.round(g.footer.y - g.last.bottom);
      }, { message: `${width}px: last visible content card ends 12px before the footer` }).toBe(12);
      proof.push({ ...geometry, atFooter: await headerLayout(page) });
    }
    if (route.route === 'start') {
      await page.setViewportSize({ width: 1440, height: 1000 });
      await loadPatient(owner, ids.a, 'restore', { clear: true });
      await expect(owner.locator('#bmiCard')).toBeVisible();
      await expect(owner.locator('html')).not.toHaveClass(/\bvilda-form-fit-viewport\b/);
      const report = owner.locator('#openChartCreatorBtn');
      await report.scrollIntoViewIfNeeded();
      await expect(report).toBeVisible();
      await expect.poll(() => report.evaluate(node => {
        const r = node.getBoundingClientRect(); return node.contains(document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2));
      }), { message: 'the calculated document action remains reachable after leaving the short-form state' }).toBe(true);
      await expectReachableFooter(page, owner);
      await expect.poll(async () => {
        const g = await headerLayout(page); return Math.round(g.footer.y - g.last.bottom);
      }).toBe(12);
      await owner.locator('#clearAllDataBtn').click();
      await expect(owner.locator('#height')).toHaveValue('');
      await expect(owner.locator('#bmiCard')).toBeHidden();
      await expect(owner.locator('html')).toHaveClass(/\bvilda-form-fit-viewport\b/);
      await expectReachableFooter(page, owner);
      await expect.poll(async () => {
        const g = await headerLayout(page); return Math.round(g.footer.y - g.last.bottom);
      }).toBe(12);
    }
    if (shell) {
      await page.setViewportSize({ width: 1920, height: 1000 });
      await owner.evaluate(id => window.VildaAuthUI.showPatientCard(id, null, null), ids.a);
      const patientCard = owner.locator('.vilda-auth-patient-card');
      await expect(patientCard).toBeVisible();
      await expect(page.locator('html')).toHaveClass(/\bvilda-pane-auth-open\b/);
      await expect.poll(() => page.locator('iframe.app-pane:not([hidden])').evaluate(node => {
        const r = node.getBoundingClientRect();
        return { left: Math.round(Math.abs(r.left)), right: Math.round(Math.abs(r.right - document.documentElement.clientWidth)) };
      }), { message: 'a real embedded patient card expands the pane across the available shell viewport' }).toEqual({ left: 0, right: 0 });
      const load = patientCard.getByRole('button', { name: 'Wczytaj tego pacjenta', exact: true });
      await load.scrollIntoViewIfNeeded();
      await expect.poll(() => load.evaluate(node => {
        const r = node.getBoundingClientRect(), x = r.x + r.width / 2, y = r.y + r.height / 2;
        const pane = window.frameElement, p = pane.getBoundingClientRect();
        return node.contains(document.elementFromPoint(x, y)) && parent.document.elementFromPoint(p.x + x, p.y + y) === pane;
      }), { message: 'expanded patient-card action is not covered by the old menu or decorative column' }).toBe(true);
    }
    expect(await owner.evaluate(id => window.VildaVault.getPatient(id), ids.a), 'resizing and scrolling do not change documentation').toEqual(record);
    await testInfo.attach('actual-card-layout.json', { body: JSON.stringify(proof, null, 2), contentType: 'application/json' });
  });
}

for (const shell of [false, true]) test(`${shell ? 'shell' : 'standalone'} Klirens: single-column fallback is reactive and leaves Search and bell disjoint`, async ({ page }) => {
  const { owner } = await prepareLayoutRoute(page, shell, LAYOUT_ROUTES[2]);
  const observed = [];
  for (const width of [1920, 1280, 1024, 992, 980, 979, 1440, 1920]) {
    await page.setViewportSize({ width, height: 1000 });
    await owner.evaluate(() => scrollTo({ top: 0, behavior: 'instant' }));
    if (width >= 992) await expectHeaderAlignment(page);
    else await expect(page.locator('#vildaHeaderSearchBtn')).toBeVisible();
    await expect.poll(async () => {
      const g = await headerLayout(page);
      return (g.second.x >= g.first.right - 1) === (g.embeddedWidth >= 980);
    }, { message: 'the real Klirens cards follow the available pane width on both sides of the breakpoint' }).toBe(true);
    const g = await headerLayout(page);
    if (width >= 992) expect(g.search.right, 'single-column Search reserves the fixed action slot').toBeLessThan(g.bell.x);
    expect(g.hostOverflow).toBeLessThanOrEqual(1);
    expect(g.contentOverflow).toBeLessThanOrEqual(1);
    observed.push(g.second.x >= g.first.right - 1);
  }
  expect(observed).toContain(false);
  expect(observed).toContain(true);
});
