import { expect, test } from '../support/test-czas.mjs';

// Real component, data and styles, without substituting geometry or modal APIs.
// The small same-origin frame models app.html, where fullscreen must reach the
// top viewport rather than remain confined to the converter's frame.
test.use({ serviceWorkers: 'block', reducedMotion: 'reduce' });

const initialContext = {
  analyte: 'lh', sex: 'male', ageYears: 0.25, preterm: 'no',
  sourceStatus: 'ready', identityKey: 'fictional-fullscreen-patient',
};
const panel = scope => scope.locator('.vilda-hormone-lifespan');
const dialog = page => page.locator('dialog.vhl-fullscreen-dialog');
const chart = scope => panel(scope).locator('[data-lifespan="chart"]');

async function openFixture(page, { width = 1440, height = 1000, framed = false, context = initialContext, resizeObserver = true } = {}) {
  if (!resizeObserver) await page.addInitScript(() => { window.ResizeObserver = undefined; });
  await page.setViewportSize({ width, height });
  const head = `<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
    <link rel="stylesheet" href="/ios26-v2.css"><link rel="stylesheet" href="/style.css"><link rel="stylesheet" href="/vilda_hormone_lifespan.css">
    <style>html{scroll-behavior:auto}body{margin:0;display:block}.fixture-gap{height:650px;flex-shrink:0}.fixture-shell{width:100%;max-width:760px;margin:0 auto;padding:12px;box-sizing:border-box}iframe{width:100%;height:480px;border:0;display:block}#background-control{position:fixed;bottom:12px;left:12px}</style>`;
  const scripts = `<script src="/vilda_hormone_lifespan_data.js"></script><script src="/vilda_hormone_lifespan.js"></script>`;
  await page.route('**/__test-hormone-fullscreen**', route => {
    const child = new URL(route.request().url()).pathname.endsWith('-frame');
    const body = child
      ? `<div style="height:130px"></div><main id="diagram"></main><div class="fixture-gap"></div>${scripts}`
      : `<button id="background-control">Przycisk strony w tle</button><div class="fixture-gap"></div><div class="fixture-shell">${framed
        ? '<iframe id="converter-frame" title="Przelicznik" src="/__test-hormone-fullscreen-frame"></iframe>'
        : '<main id="diagram"></main>'}</div><div class="fixture-gap"></div>${framed ? '' : scripts}`;
    const pageHead = framed && !child ? head.replace('<link rel="stylesheet" href="/vilda_hormone_lifespan.css">', '') : head;
    return route.fulfill({ contentType: 'text/html', body: `<!doctype html><html lang="pl"><head>${pageHead}</head><body>${body}</body></html>` });
  });
  await page.goto('/__test-hormone-fullscreen', { waitUntil: 'load' });
  const owner = framed ? page.frames().find(frame => frame.url().endsWith('-frame')) : page;
  if (!owner) throw new Error('Missing converter frame');
  await owner.evaluate(context => {
    window.fullscreenTestChart = window.VildaHormoneLifespan.mount({ host: document.querySelector('#diagram') });
    window.fullscreenTestChart.update(context);
    window.fullscreenTestPanel = document.querySelector('.vilda-hormone-lifespan');
  }, context);
  await expect(panel(owner)).toBeVisible();
  await panel(owner).locator('.vhl-expand').scrollIntoViewIfNeeded();
  return owner;
}

async function openFullscreen(page, owner) {
  await panel(owner).getByRole('button', { name: 'Powiększ', exact: true }).click();
  await expect(dialog(page)).toBeVisible();
  await expect(dialog(page)).toHaveAttribute('open', '');
  await expect(dialog(page).getByRole('button', { name: 'Zamknij', exact: true })).toBeVisible();
  await expect.poll(() => owner.evaluate(() => {
    const p = window.fullscreenTestPanel;
    return p === window.top.document.querySelector('.vilda-hormone-lifespan') && p.ownerDocument === window.top.document;
  })).toBe(true);
}

async function expectViewportDialog(page) {
  await expect.poll(() => dialog(page).evaluate(el => {
    const r = el.getBoundingClientRect();
    return Math.abs(r.x) < 1 && Math.abs(r.y) < 1 &&
      Math.abs(r.width - innerWidth) < 2 && Math.abs(r.height - innerHeight) < 2 &&
      el.scrollWidth <= el.clientWidth + 1;
  })).toBe(true);
}

async function geometry(scope) {
  return chart(scope).evaluate(svg => ({
    viewBox: svg.getAttribute('viewBox'),
    paths: [...svg.querySelectorAll('[data-line],[data-comparison-sex]')].map(path => path.getAttribute('d')),
  }));
}

async function closeFullscreen(page, owner, escape = false) {
  if (escape) await page.keyboard.press('Escape');
  else await dialog(page).getByRole('button', { name: 'Zamknij', exact: true }).click();
  await expect(dialog(page)).toHaveCount(0);
  await expect(panel(owner).locator('.vhl-expand')).toBeFocused();
  await expect.poll(() => owner.evaluate(() => window.fullscreenTestPanel.ownerDocument === document &&
    window.fullscreenTestPanel.parentElement === document.querySelector('#diagram'))).toBe(true);
}

test('fullscreen retains the panel, choices, source disclosure and original geometry on return', async ({ page }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  const owner = await openFixture(page);
  await panel(owner).locator('[data-hormone="amh"]').click();
  await panel(owner).locator('[data-hormone="inhb"]').click();
  await panel(owner).locator('button[data-stage="2"]').click();
  await panel(owner).locator('.vhl-sources > summary').click();
  const before = await owner.evaluate(() => window.fullscreenTestChart.getState());
  const originalGeometry = await geometry(owner);
  await openFullscreen(page, owner);
  await expectViewportDialog(page);
  expect(await owner.evaluate(() => window.fullscreenTestChart.getState())).toEqual(before);
  await expect(dialog(page).locator('.vhl-sources')).toHaveAttribute('open', '');
  await page.screenshot({ path: test.info().outputPath('fullscreen-desktop.png') });
  // Controls in the expanded panel keep invoking the existing component.
  await dialog(page).locator('[data-view="puberty"]').click();
  await expect(dialog(page).locator('[data-view="puberty"]')).toHaveAttribute('aria-pressed', 'true');
  await dialog(page).locator('[data-view="life"]').click();
  await closeFullscreen(page, owner);
  await expect.poll(() => geometry(owner)).toEqual(originalGeometry);
  expect((await owner.evaluate(() => window.fullscreenTestChart.getState())).selected).toEqual(before.selected);
  await expect(panel(owner).locator('.vhl-sources')).toHaveAttribute('open', '');
  expect(errors).toEqual([]);
});

test('a small converter iframe opens into the top viewport, traps focus and restores both scroll positions', async ({ page }) => {
  const owner = await openFixture(page, { framed: true });
  await panel(owner).locator('.vhl-expand').scrollIntoViewIfNeeded();
  const scrollBefore = { top: await page.evaluate(() => scrollY), frame: await owner.evaluate(() => scrollY) };
  await openFullscreen(page, owner);
  await expectViewportDialog(page);
  await expect(owner.locator('dialog')).toHaveCount(0);
  // showModal makes the background inert even when its button is focused by script.
  await page.locator('#background-control').evaluate(button => button.focus());
  expect(await page.evaluate(() => document.activeElement.id)).not.toBe('background-control');
  for (let i = 0; i < 48; i += 1) {
    await page.keyboard.press(i < 24 ? 'Tab' : 'Shift+Tab');
    const focus = await page.evaluate(() => ({
      inModal: document.activeElement.closest('dialog.vhl-fullscreen-dialog') !== null,
      hasFocus: document.hasFocus(), tag: document.activeElement.tagName, id: document.activeElement.id,
    }));
    // Native dialogs allow a keyboard stop in the browser chrome. That is
    // not focus in the underlying document; a focused document must stay modal.
    expect(focus.inModal || (!focus.hasFocus && focus.tag === 'BODY'),
      `Tab ${i}: ${JSON.stringify(focus)}`).toBe(true);
  }
  const lockedTop = await page.evaluate(() => scrollY);
  await dialog(page).evaluate(el => { el.scrollTop = el.scrollHeight; });
  await page.mouse.move(10, 10);
  await page.mouse.wheel(0, 600);
  await page.evaluate(() => new Promise(resolve => {
    requestAnimationFrame(() => { requestAnimationFrame(resolve); });
  }));
  expect(await page.evaluate(() => scrollY)).toBe(lockedTop);
  await closeFullscreen(page, owner, true);
  await expect.poll(() => page.evaluate(() => scrollY)).toBe(scrollBefore.top);
  await expect.poll(() => owner.evaluate(() => scrollY)).toBe(scrollBefore.frame);
  await page.locator('#background-control').evaluate(button => button.focus());
  await expect(page.locator('#background-control')).toBeFocused();
});

for (const width of [390, 320]) {
  test(`comparison stays usable at ${width}px and after rotation, without changing the selected hormone`, async ({ page }) => {
    const owner = await openFixture(page, { width, height: 844, framed: true,
      context: { ...initialContext, analyte: 'amh' } });
    await panel(owner).locator('[data-view="mini"]').click();
    await panel(owner).locator('.vhl-compare-toggle').click();
    const before = await owner.evaluate(() => window.fullscreenTestChart.getState());
    await openFullscreen(page, owner);
    await expectViewportDialog(page);
    expect(await owner.evaluate(() => window.fullscreenTestChart.getState())).toEqual(before);
    for (const viewport of [{ width, height: 844 }, { width: 844, height: width }]) {
      await page.setViewportSize(viewport);
      await expectViewportDialog(page);
      for (const hormone of ['inhb', 'amh']) {
        await dialog(page).locator(`[data-hormone="${hormone}"]`).click();
        await expect(dialog(page).locator(`[data-hormone="${hormone}"]`)).toHaveAttribute('aria-pressed', 'true');
        await expect(dialog(page).locator('[data-comparison-sex="female"]')).toHaveCount(1);
        await expect(dialog(page).locator('[data-comparison-sex="male"]')).toHaveCount(1);
        for (const path of (await geometry(page)).paths) {
          expect(path).toMatch(/^M/);
          expect(path).not.toMatch(/NaN|Infinity/);
        }
      }
      await page.screenshot({ path: test.info().outputPath(`fullscreen-comparison-${viewport.width}x${viewport.height}.png`) });
      // The close control remains reachable even after the expanded content scrolls.
      await dialog(page).evaluate(el => { el.scrollTop = el.scrollHeight; });
      const close = dialog(page).getByRole('button', { name: 'Zamknij', exact: true });
      await expect(close).toBeInViewport();
    }
    await closeFullscreen(page, owner);
    expect(await owner.evaluate(() => window.fullscreenTestChart.getState())).toEqual(before);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  });
}

test('the female adult estradiol cycle and sources belong to the expanded section', async ({ page }) => {
  const owner = await openFixture(page, { context: { ...initialContext, analyte: 'estradiol', sex: 'female', ageYears: 30 } });
  await expect(panel(owner).locator('[data-lifespan="cycle-panel"]')).toBeVisible();
  await openFullscreen(page, owner);
  await expect(dialog(page).locator('[data-cycle-curve="e2"]')).toHaveCount(1);
  await dialog(page).locator('.vhl-sources > summary').click();
  await expect(dialog(page).locator('.vhl-source-links a').first()).toBeVisible();
  await dialog(page).locator('[data-view="mini"]').click();
  await expect(dialog(page).locator('[data-lifespan="cycle-panel"]')).toBeHidden();
  await closeFullscreen(page, owner, true);
  await expect(panel(owner).locator('[data-view="mini"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(panel(owner).locator('.vhl-sources')).toHaveAttribute('open', '');
});

test('same-context refresh keeps fullscreen; context changes and cleanup retain other locks and the resize fallback', async ({ page }) => {
  const owner = await openFixture(page, { resizeObserver: false });
  await openFullscreen(page, owner);
  await owner.evaluate(context => window.fullscreenTestChart.update({ ...context, ageYears: 0.5 }), initialContext);
  await expect(dialog(page)).toBeVisible();
  const changedContexts = [
    { ...initialContext, identityKey: 'fictional-other-patient' },
    { ...initialContext, analyte: 'fsh' },
    { ...initialContext, sex: 'female' },
  ];
  // Another UI owner (for example an account lock) may block scrolling while
  // the chart is open. Closing our modal must not remove that owner's lock.
  await page.evaluate(() => { document.body.style.overflow = 'hidden'; });
  for (const context of changedContexts) {
    await owner.evaluate(context => window.fullscreenTestChart.update(context), context);
    await expect(dialog(page)).toHaveCount(0);
    await expect(panel(owner)).toBeVisible();
    expect(await page.evaluate(() => document.body.style.overflow)).toBe('hidden');
    await openFullscreen(page, owner);
  }
  await page.evaluate(() => document.body.style.removeProperty('overflow'));
  await owner.evaluate(() => window.fullscreenTestChart.clear());
  await expect(dialog(page)).toHaveCount(0);
  await expect(panel(owner)).toBeHidden();
  await owner.evaluate(context => window.fullscreenTestChart.update(context), initialContext);
  // Closing fullscreen must not detach the ordinary window-resize fallback.
  const beforeResize = await chart(owner).getAttribute('viewBox');
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(chart(owner)).not.toHaveAttribute('viewBox', beforeResize);
  await openFullscreen(page, owner);
  await owner.evaluate(() => window.fullscreenTestChart.destroy());
  await expect(dialog(page)).toHaveCount(0);
  await expect(panel(owner)).toHaveCount(0);
  await page.locator('#background-control').focus();
  await expect(page.locator('#background-control')).toBeFocused();
  expect(await page.evaluate(() => document.documentElement.style.overflow)).not.toBe('hidden');
  expect(await page.evaluate(() => document.body.style.position)).not.toBe('fixed');
});

test('hiding the converter or leaving its page removes the top-level modal', async ({ page }) => {
  const owner = await openFixture(page, { framed: true });
  await openFullscreen(page, owner);
  await page.locator('#converter-frame').evaluate(frame => { frame.hidden = true; });
  await expect(dialog(page)).toHaveCount(0);
  await page.locator('#converter-frame').evaluate(frame => { frame.hidden = false; });
  await expect(panel(owner)).toBeVisible();
  await openFullscreen(page, owner);
  await owner.evaluate(() => dispatchEvent(new PageTransitionEvent('pagehide')));
  await expect(dialog(page)).toHaveCount(0);
  await expect(panel(owner)).toBeVisible();
  await page.locator('#background-control').focus();
  await expect(page.locator('#background-control')).toBeFocused();
});
