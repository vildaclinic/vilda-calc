import { expect, test } from '../support/test-czas.mjs';
import { createFictionalVault, readyForPatient, shellFrame } from '../support/centile-live-fixture.mjs';
import { emulatePhone, LANDSCAPE_SAFE_AREA, PORTRAIT_SAFE_AREA } from '../support/telefon-poziomo.mjs';

// P-MENU-OBROT: native CSS env() and real pages, with only the physical orientation
// signal deliberately held back/ahead. This exercises intermediate painted frames;
// eventual geometry alone did not catch the 573 -> 820 px column-width regression.
// Chromium is not a physical Safari/keyboard validation. All vault data is fictional.
test.use({ serviceWorkers: 'block', reducedMotion: 'no-preference' });

const MENU = '[data-vilda-chrome-drawer]';
const PANEL = `${MENU} .chrome-drawer-panel`;
const TRIGGER = '[data-vilda-chrome-menu-btn]';
const CLOSE = `${MENU} .chrome-drawer-close`;

async function instrumentMotion(page) {
  await page.addInitScript(() => {
    window.__rotationAnimations = [];
    const animate = Element.prototype.animate;
    Element.prototype.animate = function (...args) {
      const animation = animate.apply(this, args);
      const target = this;
      queueMicrotask(() => window.__rotationAnimations.push({
        id: animation.id,
        target: target.id || target.className,
        duration: animation.effect?.getTiming().duration,
        frames: animation.effect?.getKeyframes().map(frame => ({ opacity: frame.opacity, transform: frame.transform })),
      }));
      return animation;
    };
  });
}

const motion = page => page.evaluate(() => window.__rotationAnimations.filter(item => item.id === 'vilda-phone-rotation'));

async function frames(page, count = 4) {
  await page.evaluate(n => new Promise(resolve => {
    let left = n;
    const next = () => { if (--left <= 0) resolve(); else requestAnimationFrame(next); };
    requestAnimationFrame(next);
  }), count);
}

async function prepare(page, { shell = false, docpro = false, pwa = false } = {}) {
  if (pwa) await page.addInitScript(() => {
    // iOS reports launch from the home-screen icon through this real runtime input.
    // This exercises the production PWA classes, not a test-only stylesheet.
    Object.defineProperty(navigator, 'standalone', { configurable: true, get: () => true });
  });
  await instrumentMotion(page);
  const cdp = await emulatePhone(page, { width: 440, height: 956 });
  let { frame } = await createFictionalVault(page, { shell });
  if (docpro) {
    await page.goto('/docpro.html', { waitUntil: 'load' });
    await readyForPatient(page);
    const confirmation = page.locator('#professionalConfirmBtn');
    if (await confirmation.isVisible()) await confirmation.click();
    frame = page;
  }
  await expect(page.locator(TRIGGER)).toBeVisible();
  await expect(page.locator('html')).toHaveClass(/\bvilda-phone\b/);
  if (pwa) {
    await expect(page.locator('html')).toHaveClass(/\bdisplay-mode-standalone\b/);
    await expect(page.locator('body')).toHaveClass(/\bdisplay-mode-standalone\b/);
  }
  await expect(frame.locator('#height')).toBeVisible();
  await frame.locator('#weight').fill('43');
  await frame.locator('#height').fill('156');
  await frame.evaluate(() => {
    document.activeElement?.blur();
    window.__rotationFields = ['age', 'height', 'weight'].map(id => document.getElementById(id));
  });
  await page.evaluate(() => {
    // Holding this signal isolates Safari's possible event orders without changing
    // production listeners, callbacks, CSS, or clinical functions.
    window.__physicalRotation = 'portrait-primary';
    Object.defineProperty(screen.orientation, 'type', { configurable: true, get: () => window.__physicalRotation });
    Object.defineProperty(window, 'orientation', { configurable: true, get: () => window.__physicalRotation.startsWith('landscape') ? 90 : 0 });
  });
  return { frame, cdp };
}

async function physicalSignal(page, landscape) {
  await page.evaluate(isLandscape => {
    window.__physicalRotation = isLandscape ? 'landscape-primary' : 'portrait-primary';
    screen.orientation.dispatchEvent(new Event('change'));
    dispatchEvent(new Event('orientationchange'));
  }, landscape);
}

async function startFrameTrace(page) {
  await page.evaluate(() => {
    window.__rotationFrames = [];
    window.__rotationDiscardedFrames = [];
    window.__rotationTraceActive = true;
    // A rAF registered before rotation may run before the shell's own rAF. Post a
    // task from rAF, so the measurement sees the complete rendering update rather
    // than an earlier callback inside the same frame that has not painted yet.
    const channel = new MessageChannel();
    window.__rotationTraceChannel = channel;
    const next = () => requestAnimationFrame(timestamp => channel.port2.postMessage({
      width: innerWidth, height: innerHeight, timestamp,
    }));
    const sample = ({ data: raf }) => {
      if (!window.__rotationTraceActive) return;
      const task = { width: innerWidth, height: innerHeight, timestamp: performance.now() };
      // CDP can resize between this rAF and its posted task. Such a task belongs
      // to the old rendering update: its new dimensions have not painted yet.
      // Keep its provenance in the report, then sample the next actual frame.
      if (raf.width !== task.width || raf.height !== task.height) {
        window.__rotationDiscardedFrames.push({ raf, task });
        next();
        return;
      }
      const iframe = document.querySelector('iframe.app-pane:not([hidden])');
      const doc = iframe?.contentDocument || document;
      const form = doc.querySelector('#calcForm');
      const user = doc.querySelector('#userSection');
      const header = document.querySelector('body > header');
      const panel = document.querySelector('.app-shell-main');
      const content = panel || document.querySelector('.main-content');
      const drawer = document.querySelector('.chrome-drawer:not([hidden])[aria-hidden="false"] .chrome-drawer-panel');
      const opacity = element => element ? Number(getComputedStyle(element).opacity) : null;
      window.__rotationFrames.push({
        width: innerWidth, height: innerHeight, physical: screen.orientation.type,
        rafTimestamp: raf.timestamp, taskTimestamp: task.timestamp,
        clientHeight: document.documentElement.clientHeight,
        visualHeight: visualViewport?.height ?? null,
        panelStyleHeight: panel?.style.height ?? null,
        focus: document.activeElement?.id || document.activeElement?.tagName,
        form: form?.getBoundingClientRect().width,
        column: user?.getBoundingClientRect().width,
        header: header?.getBoundingClientRect().height,
        headerOpacity: opacity(header),
        contentOpacity: opacity(content),
        iframeOpacity: opacity(iframe),
        drawerOpacity: opacity(drawer),
        rotationAnimations: document.getAnimations().filter(animation => animation.id === 'vilda-phone-rotation').length,
        panelBottom: panel?.getBoundingClientRect().bottom ?? null,
        hostOverflow: document.documentElement.scrollWidth - innerWidth,
        childOverflow: doc.documentElement.scrollWidth - (iframe?.contentWindow.innerWidth || innerWidth),
        childScrollY: iframe?.contentWindow.scrollY ?? scrollY,
      });
      next();
    };
    channel.port1.onmessage = sample;
    next();
  });
}

async function stopFrameTrace(page) {
  return page.evaluate(() => {
    window.__rotationTraceActive = false;
    window.__rotationTraceChannel.port1.close();
    window.__rotationTraceChannel.port2.close();
    return { frames: window.__rotationFrames, discarded: window.__rotationDiscardedFrames };
  });
}

async function rotateSplit(page, cdp, { width, height, order, safeArea = width > height ? LANDSCAPE_SAFE_AREA : PORTRAIT_SAFE_AREA }) {
  const landscape = width > height;
  await startFrameTrace(page);
  if (order === 'physical-first') {
    await physicalSignal(page, landscape);
    await frames(page);
  }
  await cdp.send('Emulation.setSafeAreaInsetsOverride', { insets: safeArea });
  await cdp.send('Emulation.setDeviceMetricsOverride', {
    width, height, screenWidth: width, screenHeight: height, mobile: true,
    deviceScaleFactor: 3,
    screenOrientation: { type: landscape ? 'landscapePrimary' : 'portraitPrimary', angle: landscape ? 90 : 0 },
  });
  // At least four rendered frames see new viewport dimensions and the old
  // physical signal in viewport-first. The old implementation is narrow here.
  await frames(page, 5);
  if (order === 'viewport-first') await physicalSignal(page, landscape);
  await frames(page, 12); // includes completion of the real 120 ms appearance
  const trace = await stopFrameTrace(page);
  const samples = trace.frames.filter(item => item.width === width && item.height === height);
  await test.info().attach(`rotation-${width}-${height}-${order}`, { body: JSON.stringify(samples, null, 2), contentType: 'application/json' });
  await test.info().attach(`rotation-${width}-${height}-${order}-discarded-cross-viewport-tasks`, {
    body: JSON.stringify(trace.discarded, null, 2), contentType: 'application/json',
  });
  expect(samples.length, 'the trace contains painted target-size frames, not only a final poll').toBeGreaterThanOrEqual(5);
  if (order === 'viewport-first') expect(samples.some(item => item.physical.startsWith(landscape ? 'portrait' : 'landscape'))).toBe(true);
  const finalWidth = samples.at(-1).form;
  for (const sample of samples) {
    expect(sample.form, `every target-size frame has final form width: ${JSON.stringify(sample)}`).toBeCloseTo(finalWidth, 0);
    expect(sample.hostOverflow, 'no horizontal overflow in the host while rotating').toBeLessThanOrEqual(1);
    expect(sample.childOverflow, 'no horizontal overflow in the active frame while rotating').toBeLessThanOrEqual(1);
    if (sample.panelBottom !== null) expect(sample.panelBottom, `the measured shell panel ends at the viewport on every rendered target-size frame: ${JSON.stringify(sample)}`).toBeCloseTo(height, 0);
    expect(sample.headerOpacity, 'the structural header remains opaque in both directions').toBe(1);
    if (!landscape) {
      for (const layer of ['contentOpacity', 'iframeOpacity', 'drawerOpacity']) {
        if (sample[layer] !== null) expect(sample[layer], `portrait ${layer} must not expose an underlying layer: ${JSON.stringify(sample)}`).toBe(1);
      }
      expect(sample.rotationAnimations, 'returning to portrait creates no rotation fade and cancels any previous one').toBe(0);
    }
  }
  if (landscape && safeArea.left === 62 && safeArea.right === 62) {
    expect(finalWidth).toBe(width - 136);
    for (const sample of samples) {
      expect(sample.column).toBeCloseTo((width - 152) / 2, 0);
      expect(sample.header).toBe(52);
    }
  }
  return samples;
}

async function assertMenu(page, { width, height, left, right, top, bottom, landscape }) {
  await expect(page.locator(MENU)).toHaveAttribute('aria-hidden', 'false');
  const geometry = await page.locator(PANEL).evaluate(panel => {
    const box = el => { const { x, y, width, height, right, bottom } = el.getBoundingClientRect(); return { x, y, width, height, right, bottom }; };
    const sections = [...panel.querySelectorAll('.chrome-drawer-section')];
    const items = [...panel.querySelectorAll('.chrome-drawer-nav a, .chrome-drawer-nav button')]
      .filter(item => item.getClientRects().length && getComputedStyle(item).display !== 'none');
    const targets = [...panel.querySelectorAll('button,a[href]')]
      .filter(item => item.getClientRects().length && getComputedStyle(item).display !== 'none');
    return { panel: box(panel), close: box(panel.querySelector('.chrome-drawer-close')),
      sections: sections.map(box), targets: targets.map(box),
      links: items.map(item => item.getAttribute('data-drawer-btn') || item.getAttribute('href')).sort(),
      overflow: panel.scrollWidth - panel.clientWidth };
  });
  expect(geometry.panel.x).toBeGreaterThanOrEqual(left + 8);
  expect(geometry.panel.right).toBeLessThanOrEqual(width - right - 8);
  expect(geometry.panel.y).toBeGreaterThanOrEqual(top + 8);
  expect(geometry.panel.bottom).toBeLessThanOrEqual(height - bottom - 8);
  expect(geometry.panel.width).toBe(landscape ? 620 : 320);
  expect(geometry.overflow).toBeLessThanOrEqual(1);
  expect(geometry.close.y).toBeGreaterThanOrEqual(top + 8);
  expect(geometry.close.bottom).toBeLessThanOrEqual(height - bottom - 8);
  for (const target of geometry.targets) {
    expect(target.height, 'visible menu actions retain a 44 px touch target').toBeGreaterThanOrEqual(44);
    expect(target.width).toBeGreaterThanOrEqual(44);
  }
  expect(geometry.links).toEqual([
    'saveDataBtnSidebar', 'addVisitNoteBtnSidebar', 'patientDocumentsBtnSidebar', 'patientsListBtnSidebar',
    'index.html', 'docpro.html', 'homa-ir.html', 'kalkulator-klirens.html',
    'steroidy.html', 'przelicznik-jednostek.html', 'materialy-edukacyjne.html',
    'notatki.html', 'terminarz.html', 'ustawienia.html',
  ].sort());
  if (landscape) {
    expect(geometry.sections[1].x).toBeGreaterThan(geometry.sections[0].right - 1);
    expect(geometry.sections[2].x).toBe(geometry.sections[0].x);
  } else {
    expect(geometry.sections[1].x).toBe(geometry.sections[0].x);
    expect(geometry.sections[1].y).toBeGreaterThan(geometry.sections[0].y);
  }
  const closeBefore = await page.locator(CLOSE).boundingBox();
  const last = page.locator(`${MENU} a[href="ustawienia.html"]`);
  await last.scrollIntoViewIfNeeded();
  await expect(last).toBeInViewport();
  expect(await page.locator(CLOSE).boundingBox(), 'close stays in place when the complete menu is scrolled').toEqual(closeBefore);
  await page.locator(CLOSE).focus();
}

for (const scenario of [
  { label: 'Start standalone', shell: false, docpro: false },
  { label: 'DocPro standalone', shell: false, docpro: true },
  { label: 'Start PWA in the shell', shell: true, docpro: false, pwa: true },
]) {
  test(`${scenario.label}: open B menu and final column widths survive both orientation event orders`, async ({ page }) => {
    test.setTimeout(150_000);
    const { frame, cdp } = await prepare(page, scenario);
    expect(await motion(page), 'the initial page does not fade as a rotation').toEqual([]);
    let hiddenDocpro;
    if (scenario.shell) {
      await page.locator('#mobileBottomDock a[href$="#/docpro"]').click();
      hiddenDocpro = await shellFrame(page, 'DocPro');
      await readyForPatient(hiddenDocpro);
      const confirmation = hiddenDocpro.locator('#professionalConfirmBtn');
      if (await confirmation.isVisible()) await confirmation.click();
      await page.locator('#mobileBottomDock a[href$="#/start"]').click();
      await expect(page.locator('iframe.app-pane[title="Start"]')).toBeVisible();
    }
    await page.locator(TRIGGER).click();
    await page.locator(CLOSE).focus();
    await page.evaluate(selector => { window.__rotationMenu = document.querySelector(selector); }, PANEL);
    await rotateSplit(page, cdp, { width: 956, height: 440, order: 'viewport-first' });
    await assertMenu(page, { width: 956, height: 440, ...LANDSCAPE_SAFE_AREA, landscape: true });
    if (hiddenDocpro) {
      await expect(hiddenDocpro.locator('html')).toHaveClass(/\bvilda-phone-landscape\b/);
      expect(await hiddenDocpro.evaluate(() => window.__rotationAnimations.filter(item => item.id === 'vilda-phone-rotation')),
        'a hidden child never adds its own competing appearance').toEqual([]);
    }
    const first = await motion(page);
    expect(first, 'open menu has exactly one appearance despite late physical orientation').toHaveLength(1);
    expect(first[0]).toMatchObject({ duration: 120 });
    expect(first[0].target).toContain('chrome-drawer-panel');
    expect(first[0].frames.map(item => item.opacity)).toEqual(['0.55', '1']);
    expect(first[0].frames.every(item => item.transform === undefined)).toBe(true);
    await rotateSplit(page, cdp, { width: 440, height: 956, order: 'physical-first' });
    await assertMenu(page, { width: 440, height: 956, ...PORTRAIT_SAFE_AREA, landscape: false });
    expect(await motion(page), 'return to portrait does not create another translucent surface').toHaveLength(1);
    if (hiddenDocpro) await expect(hiddenDocpro.locator('html')).not.toHaveClass(/\bvilda-phone-landscape\b/);
    expect(await page.evaluate(selector => window.__rotationMenu === document.querySelector(selector), PANEL), 'rotation keeps the mounted menu').toBe(true);
    await expect(page.locator(CLOSE)).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(page.locator(MENU)).toBeHidden();
    await expect(page.locator(TRIGGER)).toBeFocused();
    expect(await frame.evaluate(() => window.__rotationFields.every(node => node === document.getElementById(node.id))), 'form inputs are not remounted').toBe(true);
    await expect(frame.locator('#height')).toHaveValue('156');
    await expect(frame.locator('#weight')).toHaveValue('43');

    await frame.evaluate(() => window.scrollTo(0, 0));
    if (scenario.pwa) expect(await frame.evaluate(() => scrollY), 'PWA reproduces the report at the very top of the form').toBe(0);
    // A real, deliberately paused WAAPI effect makes a reversal before its end
    // deterministic. This checks rendered opacity and cancellation, not just an
    // animate() spy, while the existing geometry assertions still cover every frame.
    await page.evaluate(() => {
      document.addEventListener('vilda:phone-layout-changed', () => {
        window.__pendingRotation = document.getAnimations().filter(animation => animation.id === 'vilda-phone-rotation');
        for (const animation of window.__pendingRotation) {
          animation.pause();
          animation.currentTime = 60;
        }
      }, { once: true });
    });
    await rotateSplit(page, cdp, { width: 956, height: 440, order: 'physical-first' });
    const pausedAppearance = await page.evaluate(() => window.__pendingRotation.map(animation => ({
      target: animation.effect.target.className,
      opacity: Number(getComputedStyle(animation.effect.target).opacity),
      duration: animation.effect.getTiming().duration,
      time: animation.currentTime,
      state: animation.playState,
    })));
    expect(pausedAppearance, 'only the content surface fades when the menu is closed').toHaveLength(1);
    expect(pausedAppearance[0]).toMatchObject({ target: scenario.shell ? 'app-shell-main' : 'main-content', duration: 120, time: 60, state: 'paused' });
    expect(pausedAppearance[0].opacity, 'landscape still has a real subtle appearance').toBeGreaterThan(0.55);
    expect(pausedAppearance[0].opacity).toBeLessThan(1);
    const returnSamples = await rotateSplit(page, cdp, { width: 440, height: 956, order: 'viewport-first' });
    if (scenario.pwa) for (const sample of returnSamples) expect(sample.childScrollY, 'PWA return stays at the top while every content frame remains opaque').toBe(0);
    expect(await page.evaluate(() => window.__pendingRotation.map(animation => ({ state: animation.playState, time: animation.currentTime }))),
      'return cancels the unfinished landscape effect instead of finishing or replacing it').toEqual([{ state: 'idle', time: null }]);
    await expect(frame.locator('#height')).toHaveValue('156');
    await expect(frame.locator('#weight')).toHaveValue('43');
    if (scenario.shell) {
      // Rotation is a real layout change even while a field owns focus. Subsequent
      // height-only keyboard changes still use the existing frozen panel contract.
      await frame.locator('#height').focus();
      const focusedSamples = await rotateSplit(page, cdp, { width: 956, height: 440, order: 'viewport-first' });
      expect(focusedSamples.at(-1).panelBottom).toBe(440);
      await expect(frame.locator('#height')).toBeFocused();
      await expect(frame.locator('#height')).toHaveValue('156');
      const beforeKeyboard = await page.locator('.app-shell-main').boundingBox();
      const animationsBeforeKeyboard = await motion(page);
      await page.evaluate(() => {
        Object.defineProperty(visualViewport, 'height', { configurable: true, get: () => 210 });
        visualViewport.dispatchEvent(new Event('resize'));
        dispatchEvent(new Event('resize'));
      });
      await frames(page, 12);
      expect(await page.locator('.app-shell-main').boundingBox(), 'keyboard does not resize the focused iframe after rotation').toEqual(beforeKeyboard);
      expect(await motion(page), 'keyboard does not add another appearance').toEqual(animationsBeforeKeyboard);
      await expect(page.locator('html')).toHaveClass(/\bvilda-phone-landscape\b/);
      await expect(frame.locator('#height')).toBeFocused();
      expect(await page.evaluate(() => scrollY), 'the shell itself stays at the viewport origin').toBe(0);
    }
  });
}

test('smaller landscape, either safe edge, keyboard and reduced motion retain menu/focus without spurious fades', async ({ page }) => {
  test.setTimeout(150_000);
  const { frame, cdp } = await prepare(page);
  await page.locator(TRIGGER).click();
  for (const safeArea of [{ top: 0, bottom: 21, left: 62, right: 0 }, { top: 0, bottom: 21, left: 0, right: 62 }]) {
    await rotateSplit(page, cdp, { width: 844, height: 390, order: 'physical-first', safeArea });
    await assertMenu(page, { width: 844, height: 390, ...safeArea, landscape: true });
    const disabledSave = page.locator(`${MENU} [data-drawer-btn="saveDataBtnSidebar"]`);
    await disabledSave.scrollIntoViewIfNeeded();
    await disabledSave.click({ force: true }); // aria-disabled deliberately exposes its explanation
    const explanation = page.locator(`${MENU} > .vilda-tip`).last();
    await expect(explanation).toBeVisible();
    const tip = await explanation.boundingBox();
    expect(tip.x, 'the disabled-action explanation also avoids the safe left edge').toBeGreaterThanOrEqual(safeArea.left);
    expect(tip.x + tip.width, 'the explanation remains before the safe right edge').toBeLessThanOrEqual(844 - safeArea.right);
    await expect(page.locator(MENU)).toHaveAttribute('aria-hidden', 'false');
  }
  expect(await motion(page), 'inset or ordinary same-orientation changes do not replay the appearance').toHaveLength(1);
  await page.keyboard.press('Escape');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await rotateSplit(page, cdp, { width: 440, height: 956, order: 'viewport-first' });
  expect(await motion(page), 'reduced-motion disables the rotation appearance').toHaveLength(1);
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await frame.locator('#height').focus();
  await page.evaluate(() => {
    Object.defineProperty(visualViewport, 'height', { configurable: true, get: () => 280 });
    visualViewport.dispatchEvent(new Event('resize'));
    dispatchEvent(new Event('resize'));
  });
  await frames(page, 4);
  await expect(page.locator('html')).not.toHaveClass(/\bvilda-phone-landscape\b/);
  await expect(frame.locator('#height')).toBeFocused();
  await cdp.send('Emulation.setDeviceMetricsOverride', {
    width: 440, height: 280, screenWidth: 440, screenHeight: 956, mobile: true,
    deviceScaleFactor: 3, screenOrientation: { type: 'portraitPrimary', angle: 0 },
  });
  await frames(page, 4);
  await expect(page.locator('html')).not.toHaveClass(/\bvilda-phone-landscape\b/);
  await expect(frame.locator('#height')).toBeFocused();
  await expect(frame.locator('#height')).toHaveValue('156');
  expect(await motion(page), 'both visual-viewport and layout-viewport keyboard contraction remain motionless').toHaveLength(1);
  await expect(page.locator('#mobileBottomDock')).toHaveClass(/\bis-keyboard-hidden\b/);
  await page.evaluate(() => { delete visualViewport.height; });
  await rotateSplit(page, cdp, { width: 844, height: 390, order: 'physical-first' });
  const focusedRotation = (await motion(page)).slice(1);
  expect(focusedRotation.length).toBeGreaterThan(0);
  expect(focusedRotation.some(item => item.target === 'mobileBottomDock'),
    'appearance does not override a dock hidden by the real standalone input-focus handler').toBe(false);
  await expect(frame.locator('#height')).toBeFocused();
});

test('focused shell rotation uses current layout height despite stale visualViewport and late safe-area insets', async ({ page }) => {
  test.setTimeout(150_000);
  const { frame, cdp } = await prepare(page, { shell: true });
  await frame.locator('#height').focus();
  await page.evaluate(() => {
    window.__rotationViewportHeight = 956;
    Object.defineProperty(visualViewport, 'height', { configurable: true, get: () => window.__rotationViewportHeight });
  });
  await rotateSplit(page, cdp, { width: 956, height: 440, order: 'viewport-first' });
  const landscapePanel = await page.locator('.app-shell-main').boundingBox();
  expect(landscapePanel.y + landscapePanel.height).toBe(440);
  const rotationAnimations = await motion(page);
  expect(rotationAnimations.length).toBeGreaterThan(0);
  await expect(frame.locator('#height')).toBeFocused();
  await page.evaluate(() => {
    window.__rotationViewportHeight = 440;
    visualViewport.dispatchEvent(new Event('resize'));
  });
  await frames(page, 8);
  expect(await page.locator('.app-shell-main').boundingBox(), 'late VV height cannot produce a second panel correction').toEqual(landscapePanel);

  // The reverse event order is also legitimate: portrait viewport/orientation first,
  // env(safe-area-inset-*) only later, with NO subsequent resize event.
  await rotateSplit(page, cdp, { width: 440, height: 956, order: 'physical-first', safeArea: LANDSCAPE_SAFE_AREA });
  await page.evaluate(() => { window.__rotationViewportHeight = 956; });
  await cdp.send('Emulation.setSafeAreaInsetsOverride', { insets: PORTRAIT_SAFE_AREA });
  const shellGeometry = () => page.evaluate(() => {
    const header = document.querySelector('body > header').getBoundingClientRect();
    const panel = document.querySelector('.app-shell-main').getBoundingClientRect();
    return { headerTop: header.top, panelTop: panel.top, panelBottom: panel.bottom, hostScrollY: scrollY };
  });
  const expected = { headerTop: 59, panelTop: 150, panelBottom: 956, hostScrollY: 0 };
  await expect.poll(shellGeometry, { message: 'ResizeObserver reconciles late native env() insets even with a focused iframe input' }).toEqual(expected);
  const animationCount = (await motion(page)).length;
  // Frame-based negative check spans the old 200 ms delayed resize correction.
  await frames(page, 20);
  expect(await shellGeometry(), 'no later orientation timer moves the completed portrait layout').toEqual(expected);
  expect((await motion(page)).length, 'late insets/VV do not replay orientation appearance').toBe(animationCount);
  await expect(frame.locator('#height')).toBeFocused();
  await expect(frame.locator('#height')).toHaveValue('156');
});
