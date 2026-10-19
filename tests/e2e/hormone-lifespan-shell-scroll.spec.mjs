import { expect, test } from '../support/test-czas.mjs';

// Real app.html, authentication and converter provider: the small iframe fixture
// does not reproduce the shell's focus/scroll handlers after dialog.close().
test.use({ serviceWorkers: 'block', reducedMotion: 'reduce' });
test.setTimeout(120_000);

async function openChart(page, width) {
  await page.setViewportSize({ width, height: 900 });
  await page.route('**/*', route => {
    const url = new URL(route.request().url());
    return url.hostname === '127.0.0.1' || /^(data|blob):$/.test(url.protocol)
      ? route.continue() : route.abort();
  });
  await page.addInitScript(() => {
    localStorage.setItem('vilda-terms-accepted-v1', JSON.stringify({ version: 1, acceptedAtISO: new Date().toISOString() }));
    const date = new Date();
    const iso = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    for (const key of ['vilda-reminders-shown-v1', 'vilda-reminders-closed-v1']) {
      localStorage.setItem(key, `${iso}|${Date.now()}`);
    }
  });
  await page.goto('/przelicznik-jednostek.html', { waitUntil: 'load' });
  await page.waitForFunction(() => Boolean(window.VildaSession));
  await page.evaluate(() => window.VildaSession.ensureAuthLoaded());
  await page.waitForFunction(() => Boolean(window.VildaVault));
  await page.evaluate(() => window.VildaVault.createUser('E2e#ChartScroll!2026', {
    label: 'Fikcyjny sejf testu przewijania', iterations: 10000,
  }));
  await page.goto('/app.html#/lab', { waitUntil: 'load' });
  const iframe = page.locator('iframe.app-pane[title="Jednostki laboratoryjne"]');
  await expect(iframe).toBeVisible();
  const owner = await (await iframe.elementHandle()).contentFrame();
  if (!owner) throw new Error('Missing production converter frame');
  await owner.waitForFunction(() => window.VildaVault?.isUnlocked()
    && window.VildaHormoneLifespanRuntime && window.VildaLabPubertyRuntime
    && !document.documentElement.classList.contains('vilda-auth-locked'));

  // The shell preloads Start, whose first calculation writes basicGrowthData.
  // Complete that real boot before taking a clinical-state snapshot; otherwise
  // an unrelated delayed startup write looks like a fullscreen data mutation.
  const startIframe = page.locator('iframe.app-pane[title="Start"]');
  await startIframe.waitFor({ state: 'attached' });
  const start = await (await startIframe.elementHandle()).contentFrame();
  if (!start) throw new Error('Missing production Start frame');
  await start.waitForLoadState('load');
  await start.waitForFunction(() => window.VildaPersistRuntime?.getSnapshot().initialized
    && window.VildaVault?.isUnlocked());
  for (const scope of [page, owner]) {
    const consent = scope.locator('#consent-decline');
    if (await consent.isVisible()) await consent.click();
  }
  await owner.evaluate(() => {
    if (!window.VildaPersistence.writeShared({ name: 'Fikcyjny pacjent przewijania', sex: 'M', age: 12, ageMonths: 0 }, { force: true })) {
      throw new Error('Cannot seed fictional chart patient');
    }
    document.dispatchEvent(new CustomEvent('vilda:session-changed'));
  });
  await owner.locator('#labSubstance').fill('LH');
  await owner.locator('#labSubstanceDropdown [data-id="lh"]').click();
  await owner.locator('#labValue').fill('2');
  await expect(owner.locator('.vilda-hormone-lifespan')).toBeVisible();
  // Put the anchor a quarter down the frame's own viewport so the frame is always scrolled: the restoration
  // check needs a non-zero offset. Since the wide-screen converter workspace (2026-10-19) the chart sits in
  // the right column at 1440px and its expand button can be visible without any scrolling, where
  // scrollIntoViewIfNeeded() is a no-op. window.scrollBy, unlike scrollIntoView, leaves the shell document
  // alone; 'instant' bypasses the page's smooth scrolling so the snapshot never catches a scroll in flight.
  await owner.evaluate(() => {
    const button = document.querySelector('.vhl-expand');
    window.scrollBy({ top: button.getBoundingClientRect().top - window.innerHeight / 4, behavior: 'instant' });
  });
  return owner;
}

async function snapshot(owner) {
  return owner.evaluate(() => {
    const button = document.querySelector('.vhl-expand');
    const anchor = button.getBoundingClientRect();
    const frame = frameElement.getBoundingClientRect();
    return {
      frameScroll: scrollY, topScroll: top.scrollY,
      anchorY: anchor.y, viewportAnchorY: anchor.y + frame.y,
      shared: window.VildaPersistence.readShared(),
      assessment: window.VildaLabPubertyRuntime.getAssessment(),
      value: document.querySelector('#labValue').value,
      focused: document.activeElement === button && document.hasFocus()
        && top.document.activeElement === frameElement,
    };
  });
}

async function nextPaints(page) {
  await page.evaluate(() => new Promise(resolve => {
    requestAnimationFrame(() => requestAnimationFrame(resolve));
  }));
}

for (const width of [1440, 320]) {
  test(`real shell restores scroll, viewport anchor and focus through three fullscreen cycles at ${width}px`, async ({ page }) => {
    const owner = await openChart(page, width);
    await nextPaints(page);
    const before = await snapshot(owner);
    expect(before.frameScroll).toBeGreaterThan(0);
    for (let cycle = 0; cycle < 3; cycle += 1) {
      await owner.locator('.vhl-expand').click();
      const expanded = page.locator('dialog.vhl-fullscreen-dialog');
      await expect(expanded).toBeVisible();
      if (cycle === 1) {
        await expanded.locator('[data-view="puberty"]').click();
        await expanded.locator('[data-view="life"]').click();
      }
      if (cycle === 2) {
        await expanded.locator('.vhl-sources > summary').click();
        await expanded.locator('.vhl-sources > summary').click();
      }
      if (cycle % 2 === 0) await page.keyboard.press('Escape');
      else await expanded.getByRole('button', { name: 'Zamknij', exact: true }).click();
      await expect(expanded).toHaveCount(0);
      await expect(owner.locator('.vhl-expand')).toBeFocused();
      // Check both focus restoration and the following layout/paint cycle.
      // A transient correct scroll position must not hide a later focus jump.
      for (const phase of ['focused', 'painted']) {
        if (phase === 'painted') await nextPaints(page);
        const after = await snapshot(owner);
        const label = `${width}px cycle ${cycle + 1}, ${phase}`;
        for (const key of ['frameScroll', 'topScroll', 'anchorY', 'viewportAnchorY']) {
          expect.soft(Math.abs(after[key] - before[key]), `${label}: ${key}`).toBeLessThanOrEqual(1);
        }
        expect(after.focused, `${label}: true frame focus`).toBe(true);
        expect({ shared: after.shared, assessment: after.assessment, value: after.value }, `${label}: clinical state`)
          .toEqual({ shared: before.shared, assessment: before.assessment, value: before.value });
      }
    }
  });
}
