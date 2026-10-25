import { devices } from '@playwright/test';
import { expect, test } from '../support/test-czas.mjs';
import { clinicalFingerprint, createFictionalVault, fixturePreferences, loadPatient, readyForPatient, shellFrame } from '../support/centile-live-fixture.mjs';
import { emulatePhone, expectLandscape, layoutGeometry, LANDSCAPE_SAFE_AREA } from '../support/telefon-poziomo.mjs';

test.use({ serviceWorkers: 'block', reducedMotion: 'reduce' });

async function dockTab(page, route, title) {
  await page.locator(`#mobileBottomDock a[href$="#/${route}"]`).click();
  const frame = await shellFrame(page, title);
  await expect(page.locator(`iframe.app-pane[title="${title}"]`)).toBeVisible();
  if (title === 'DocPro') await readyForPatient(frame);
  const professionalConfirmation = frame.locator('#professionalConfirmBtn');
  if (await professionalConfirmation.isVisible()) await professionalConfirmation.click();
  return frame;
}

async function assertLandscapeGeometry(page, frame, width, height) {
  await expectLandscape(page, true);
  await expectLandscape(frame, true);
  await expect.poll(async () => (await layoutGeometry(page, frame)).host.header.height).toBe(52);
  await expect.poll(async () => (await layoutGeometry(page, frame)).host.dock.height).toBe(52);
  await expect.poll(async () => (await layoutGeometry(page, frame)).content.container.width).toBe(width - 124);
  // The shell recomputes its measured height on the next ResizeObserver frame
  // after the physical orientation and safe-area change have both arrived.
  if (frame !== page) await expect.poll(async () => (await layoutGeometry(page, frame)).host.panel.bottom).toBe(height);
  // Blur and visualViewport resize restore the dock asynchronously. Its height
  // can already be 52 px while the keyboard transform still places it offscreen.
  await expect.poll(async () => {
    const { host } = await layoutGeometry(page, frame);
    return host.viewport.height - host.dock.bottom;
  }).toBeGreaterThanOrEqual(LANDSCAPE_SAFE_AREA.bottom);
  const { host, content } = await layoutGeometry(page, frame);
  expect(host.viewport).toEqual({ width, height });
  expect(host.dock.width).toBe(552);
  expect(host.headerControls).toHaveLength(4);
  for (const control of host.headerControls) {
    expect(control.height, 'menu, przypomnienia, pacjent i konto mają cele dotyku 44 px').toBeGreaterThanOrEqual(44);
    expect(control.width).toBeGreaterThanOrEqual(44);
  }
  expect(host.dockItems).toHaveLength(5);
  for (const item of host.dockItems) {
    expect(item.height, 'każdy cel dotyku Docka ma co najmniej 44 px').toBeGreaterThanOrEqual(44);
    expect(item.width).toBeGreaterThanOrEqual(44);
  }
  expect(host.horizontalOverflow).toBeLessThanOrEqual(0);
  expect(content.horizontalOverflow).toBeLessThanOrEqual(0);
  expect(host.dock.x).toBeGreaterThanOrEqual(62);
  expect(host.dock.right).toBeLessThanOrEqual(width - 62);
  expect(host.viewport.height - host.dock.bottom).toBeGreaterThanOrEqual(LANDSCAPE_SAFE_AREA.bottom);
  if (frame !== page) {
    expect(host.panel.bottom, 'ramka kończy się dokładnie na ekranie, także ponad progiem desktopu 992 px').toBe(height);
    expect(host.frame.x + content.form.x, 'safe-area jest naliczona tylko w hoście').toBe(68);
    expect(content.dockSpacer, 'ramka dostaje zmierzoną wysokość Docka z dolnym odstępem').toBeCloseTo(height - host.dock.y, 0);
  } else {
    expect(content.form.x).toBe(68);
  }
  if (content.form) {
    expect(content.form.width).toBe(width - 136);
    expect(content.user.width).toBeCloseTo((width - 152) / 2, 0);
    expect(content.info.x - content.user.right).toBeCloseTo(16, 0);
  }
}

async function rememberInputNodes(frame) {
  await frame.evaluate(() => {
    window.__landscapeInputNodes = ['lastName', 'firstName', 'age', 'height', 'weight'].map(id => document.getElementById(id));
  });
}

async function expectSameInputNodes(frame) {
  expect(await frame.evaluate(() => window.__landscapeInputNodes.every(node => node === document.getElementById(node.id))),
    'obrót nie odmontowuje ani nie zastępuje pól pacjenta').toBe(true);
}

test('powłoka: zapisany fikcyjny pacjent, Nowy pomiar, 956/844/1080 px i wszystkie zakładki Docka bez utraty stanu', async ({ page }) => {
  test.setTimeout(180_000);
  await emulatePhone(page, { width: 440, height: 956 });
  const { frame: start, ids } = await createFictionalVault(page, { shell: true });
  await loadPatient(start, ids.a, 'new');
  await expectLandscape(page, false);
  await expectLandscape(start, false);
  const portrait = await layoutGeometry(page, start);
  expect(portrait.host.header.height).toBe(91);
  expect(portrait.content.info.y).toBeGreaterThan(portrait.content.user.y);

  // DocPro is mounted and then hidden BEFORE rotation. It must inherit the host's
  // state despite its zero-sized iframe viewport while hidden.
  await dockTab(page, 'docpro', 'DocPro');
  await dockTab(page, 'start', 'Start');
  const docpro = await shellFrame(page, 'DocPro');
  const before = await clinicalFingerprint(start, ids.a);
  await rememberInputNodes(start);
  for (const [width, height] of [[956, 440], [844, 390], [1080, 480]]) {
    await emulatePhone(page, { width, height });
    await assertLandscapeGeometry(page, start, width, height);
    await expect.poll(() => start.evaluate(() => window.VildaCentileLivePanel?.getState()), { timeout: 30_000 }).toMatchObject({ eligible: true, status: 'ready', patientId: ids.a });
    await expectLandscape(docpro, true);
    await expectSameInputNodes(start);
    expect(await clinicalFingerprint(start, ids.a), 'sam układ nie zmienia pól, historii sejfu, adnotacji ani stanu zapisu').toEqual(before);
    await emulatePhone(page, { width: height, height: width });
    await expectLandscape(page, false);
    await expectLandscape(start, false);
    await expectLandscape(docpro, false);
    const portraitAgain = await layoutGeometry(page, start);
    expect(portraitAgain.host.header.height).toBe(portrait.host.header.height);
    expect(portraitAgain.content.info.y).toBeGreaterThan(portraitAgain.content.user.y);
    expect(await clinicalFingerprint(start, ids.a)).toEqual(before);
  }

  await emulatePhone(page, { width: 956, height: 440 });
  await assertLandscapeGeometry(page, start, 956, 440);
  for (const [path, title] of [
    ['docpro', 'DocPro'], ['notatki', 'Notatki'],
    ['lab', 'Jednostki laboratoryjne'], ['terminarz', 'Terminarz'],
    ['start', 'Start'],
  ]) {
    const frame = await dockTab(page, path, title);
    await expectLandscape(frame, true);
    expect(await frame.evaluate(() => document.documentElement.scrollWidth - innerWidth), title).toBeLessThanOrEqual(0);
    await expect(page.locator('#mobileBottomDock')).toBeVisible();
    if (title === 'DocPro' || title === 'Start') await assertLandscapeGeometry(page, frame, 956, 440);
  }
  await expect(start.locator('#height')).toHaveValue('');
  await expect(start.locator('#weight')).toHaveValue('');
  await expectSameInputNodes(start);

  // Actual parent-mounted fullscreen dialog still covers the phone and returns focus.
  const expand = start.locator('.vilda-centile-live-expand');
  await expand.click();
  const dialog = page.locator('.vilda-centile-live-dialog');
  await expect(dialog).toBeVisible();
  const box = await dialog.boundingBox();
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(956);
  expect(box.y + box.height).toBeLessThanOrEqual(440);
  await dialog.locator('.vilda-centile-live-close').click();
  await expect(dialog).toHaveCount(0);
  await expect(expand).toBeFocused();
});

test('samodzielny Start: 844 px, zachowany fokus; klawiatura w pionie nie uruchamia poziomego układu', async ({ page }) => {
  test.setTimeout(120_000);
  await emulatePhone(page, { width: 844, height: 390 });
  const { ids } = await createFictionalVault(page);
  await loadPatient(page, ids.a, 'new');
  await assertLandscapeGeometry(page, page, 844, 390);
  await rememberInputNodes(page);
  await page.locator('#height').focus();
  await expect(page.locator('#height')).toBeFocused();
  await expect.poll(() => page.locator('#mobileBottomDock').evaluate(el => el.classList.contains('is-keyboard-hidden'))).toBe(true);
  const cdp = await emulatePhone(page, { width: 390, height: 844 });
  await expectLandscape(page, false);
  await expect(page.locator('#height')).toBeFocused();
  await expectSameInputNodes(page);

  // Real screen remains portrait. Only visualViewport contracts, as with a keyboard.
  await page.evaluate(() => {
    Object.defineProperty(visualViewport, 'height', { configurable: true, get: () => 280 });
    visualViewport.dispatchEvent(new Event('resize'));
    dispatchEvent(new Event('resize'));
  });
  await expectLandscape(page, false);
  expect(await page.evaluate(() => screen.orientation.type)).toBe('portrait-primary');
  expect(await page.evaluate(() => innerWidth > visualViewport.height)).toBe(true);
  await expect(page.locator('#height')).toBeFocused();
  await expectSameInputNodes(page);
  // Android-style resize can also contract the layout viewport; the unchanged
  // physical portrait screen still must not qualify as a landscape phone.
  await cdp.send('Emulation.setDeviceMetricsOverride', {
    width: 390, height: 280, screenWidth: 390, screenHeight: 844, mobile: true, deviceScaleFactor: 3,
    screenOrientation: { type: 'portraitPrimary', angle: 0 },
  });
  await expectLandscape(page, false);
  expect(await page.evaluate(() => innerWidth > innerHeight)).toBe(true);
  await expect(page.locator('#height')).toBeFocused();
  await page.evaluate(() => {
    delete visualViewport.height;
    document.activeElement.blur();
    visualViewport.dispatchEvent(new Event('resize'));
  });
  await emulatePhone(page, { width: 844, height: 390 });
  await assertLandscapeGeometry(page, page, 844, 390);
});

test('dotykowy tablet i wąskie okno komputera zachowują swój układ nawet z niską ramką', async ({ browser, baseURL }) => {
  for (const device of [
    { ...devices['iPad Pro 11'], width: 1194, height: 834, mobile: true },
    { ...devices['Desktop Chrome'], width: 956, height: 440, mobile: false },
  ]) {
    const { width, height, mobile, ...options } = device;
    const context = await browser.newContext({ ...options, baseURL, serviceWorkers: 'block', viewport: { width, height } });
    try {
      const page = await context.newPage();
      const cdp = await context.newCDPSession(page);
      await cdp.send('Emulation.setDeviceMetricsOverride', {
        width, height, screenWidth: width, screenHeight: height, mobile, deviceScaleFactor: 1,
        screenOrientation: { type: 'landscapePrimary', angle: 90 },
      });
      await fixturePreferences(page);
      await page.goto('/app.html#/start', { waitUntil: 'load' });
      const start = await shellFrame(page);
      await expectLandscape(page, false);
      await expectLandscape(start, false);
      expect(await page.evaluate(() => matchMedia('(pointer: coarse)').matches)).toBe(mobile);
      // Tablets can have an iframe shorter than 540 px; the physical screen still wins.
      await cdp.send('Emulation.setDeviceMetricsOverride', {
        width, height: 350, screenWidth: width, screenHeight: height, mobile, deviceScaleFactor: 1,
        screenOrientation: { type: 'landscapePrimary', angle: 90 },
      });
      await expectLandscape(page, false);
      await expectLandscape(start, false);
    } finally {
      await context.close();
    }
  }
});
