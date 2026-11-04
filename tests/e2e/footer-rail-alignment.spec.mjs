import { devices, expect, test } from '@playwright/test';
import { LAYOUT_ROUTES, prepareLayoutRoute, expectReachableFooter } from '../support/header-layout-fixture.mjs';

test.use({ serviceWorkers: 'block', reducedMotion: 'reduce' });
test.setTimeout(120_000);

const BAND = '#vildaDecorFooter';

async function geometry(page) {
  return page.evaluate(() => {
    const pane = document.querySelector('iframe.app-pane:not([hidden])');
    const owner = pane ? pane.contentDocument : document;
    const origin = pane ? pane.getBoundingClientRect() : { x: 0, y: 0, bottom: innerHeight };
    const box = (node, child = false) => {
      if (!node) return null;
      const r = node.getBoundingClientRect(), x = r.x + (child ? origin.x : 0), y = r.y + (child ? origin.y : 0);
      return { x, y, right: x + r.width, bottom: y + r.height, width: r.width, height: r.height };
    };
    const footer = owner.querySelector('.site-footer');
    const inner = footer.querySelector('.site-footer__inner');
    const band = document.getElementById('vildaDecorFooter');
    const rail = document.querySelector('.desktop-layout > .decor-sidebar');
    const style = owner.defaultView.getComputedStyle(footer), inset = owner.defaultView.getComputedStyle(inner);
    const bandStyle = band && getComputedStyle(band);
    const links = [...footer.querySelectorAll('.site-footer__col a')];
    return {
      footer: box(footer, true), band: box(band), rail: box(rail),
      clipBottom: Math.min(innerHeight, origin.bottom),
      background: style.backgroundColor, border: style.borderTop,
      bandBackground: bandStyle?.backgroundColor, bandBorder: bandStyle?.borderTop,
      padding: [parseFloat(inset.paddingLeft), parseFloat(inset.paddingRight)],
      brand: box(footer.querySelector('.site-footer__brand-link'), true),
      finalLink: box(links[links.length - 1], true),
      railVisibleChildren: [...rail.children].filter(node => {
        const r = node.getBoundingClientRect(); return r.width && r.height && getComputedStyle(node).visibility !== 'hidden';
      }).length,
      overflow: Math.max(document.documentElement.scrollWidth - innerWidth,
        owner.documentElement.scrollWidth - owner.defaultView.innerWidth),
    };
  });
}

async function expectFullBand(page, owner) {
  await expectReachableFooter(page, owner);
  await expect(page.locator(BAND)).toBeVisible();
  await expect.poll(async () => {
    const g = await geometry(page);
    const delta = (a, b) => Math.round(Math.abs(a - b));
    return {
      join: delta(g.band.x, g.footer.right),
      top: delta(g.band.y, g.footer.y),
      bottom: delta(g.band.bottom, g.footer.bottom),
      right: delta(g.band.right, g.rail.right),
      background: g.bandBackground === g.background,
      border: g.bandBorder === g.border,
      padding: g.padding,
      leftInset: Math.round(g.brand.x - g.footer.x),
      rightInset: Math.round(g.footer.right - g.finalLink.right),
    };
  }, { message: 'the actual footer continues through the rail with symmetric readable content' }).toEqual({
    join: 0, top: 0, bottom: 0, right: 0, background: true, border: true,
    padding: [12, 12], leftInset: 12, rightInset: 12,
  });
  await expect(page.locator(BAND)).toHaveAttribute('aria-hidden', 'true');
  await expect(page.locator(BAND)).toHaveCSS('pointer-events', 'none');
  await expect(page.locator(BAND)).toHaveText('');
  expect((await geometry(page)).overflow).toBeLessThanOrEqual(1);
  for (const link of await owner.locator('.site-footer__col a').all()) await link.click({ trial: true });
}

for (const shell of [false, true]) {
  test(`${shell ? 'shell' : 'standalone'}: footer paint follows the empty wide rail, scroll and breakpoint without covering links`, async ({ page, browser }, testInfo) => {
    await page.setViewportSize({ width: 1920, height: 600 });
    const { owner } = await prepareLayoutRoute(page, shell, LAYOUT_ROUTES[0]);
    const proof = [];
    for (const width of [1400, 1920, 2560]) {
      await page.setViewportSize({ width, height: 600 });
      await owner.evaluate(() => scrollTo({ top: 0, behavior: 'instant' }));
      await expect(page.locator(BAND)).toBeHidden();
      expect((await geometry(page)).railVisibleChildren, 'the reserved rail is genuinely empty').toBe(0);
      await expectFullBand(page, owner);
      proof.push({ width, full: await geometry(page) });
      if (width >= 1920) {
        const screenshot = testInfo.outputPath(`footer-${shell ? 'shell' : 'standalone'}-${width}.png`);
        await page.screenshot({ path: screenshot, clip: { x: 0, y: 360, width, height: 240 } });
        await testInfo.attach(`footer-${width}`, { path: screenshot, contentType: 'image/png' });
      }
      await owner.evaluate(() => scrollBy({ top: -40, behavior: 'instant' }));
      await expect.poll(async () => {
        const g = await geometry(page);
        return {
          sameTop: Math.round(Math.abs(g.band.y - g.footer.y)),
          clippedBottom: Math.round(Math.abs(g.band.bottom - g.clipBottom)),
          footerContinuesBelow: g.footer.bottom > g.clipBottom + 20,
          partiallyPainted: g.band.height > 0 && g.band.height < g.footer.height - 20,
        };
      }, { message: 'only the visible part of the footer extends into the rail while scrolling' })
        .toEqual({ sameTop: 0, clippedBottom: 0, footerContinuesBelow: true, partiallyPainted: true });
      proof.push({ width, partial: await geometry(page) });
    }
    await page.setViewportSize({ width: 1399, height: 844 });
    await expectReachableFooter(page, owner);
    await expect(page.locator(BAND)).toBeHidden();
    expect((await geometry(page)).overflow).toBeLessThanOrEqual(1);
    // Exercise the real phone layout/device signals, not a desktop browser
    // merely narrowed to phone width after its desktop bootstrap.
    const phone = await browser.newContext({ ...devices['iPhone 15 Pro'],
      viewport: { width: 390, height: 844 }, baseURL: testInfo.project.use.baseURL,
      serviceWorkers: 'block', reducedMotion: 'reduce' });
    try {
      const mobile = await phone.newPage();
      const { owner: mobileOwner } = await prepareLayoutRoute(mobile, shell, LAYOUT_ROUTES[0]);
      await expectReachableFooter(mobile, mobileOwner);
      await expect(mobile.locator(BAND)).toBeHidden();
      expect((await geometry(mobile)).overflow).toBeLessThanOrEqual(1);
    } finally {
      await phone.close();
    }
    await testInfo.attach('footer-rail-geometry.json', { body: JSON.stringify(proof, null, 2), contentType: 'application/json' });
  });
}

test('shell: rail footer follows the active route and disappears for Lab and Terminarz', async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 800 });
  const { owner: start } = await prepareLayoutRoute(page, true, LAYOUT_ROUTES[0]);
  await expectFullBand(page, start);
  for (const { route, file, painted } of [
    { route: 'lab', file: 'przelicznik-jednostek.html', painted: false },
    { route: 'klirens', file: 'kalkulator-klirens.html', painted: true },
    { route: 'terminarz', file: 'terminarz.html', painted: false },
    { route: 'docpro', file: 'docpro.html', painted: true },
    { route: 'start', file: 'index.html', painted: true },
  ]) {
    await page.evaluate(target => window.VildaShell.navigate(target), route);
    const active = page.locator('iframe.app-pane:not([hidden])');
    await expect(active).toHaveAttribute('src', new RegExp(file.replace('.', '\\.')));
    const owner = await (await active.elementHandle()).contentFrame();
    await owner.waitForFunction(path => location.pathname.endsWith(path) && document.readyState === 'complete', file);
    if (route === 'docpro') {
      await owner.locator('#professionalConfirmBtn').click();
      await expect(owner.locator('#professionalOverlay')).toBeHidden();
    }
    if (painted) await expectFullBand(page, owner);
    else {
      await owner.evaluate(() => scrollTo({ top: document.documentElement.scrollHeight, behavior: 'instant' }));
      await expect(page.locator('#vildaShellDecor')).toBeHidden();
      await expect(page.locator(BAND)).toBeHidden();
    }
  }
});
