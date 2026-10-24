import { expect } from '@playwright/test';

const sessions = new WeakMap();
export const LANDSCAPE_SAFE_AREA = { top: 0, right: 62, bottom: 21, left: 62 };
export const PORTRAIT_SAFE_AREA = { top: 59, right: 0, bottom: 34, left: 0 };

// Chromium emulates physical screen orientation, coarse pointer and native CSS env().
// Merely shrinking the viewport would incorrectly model a portrait software keyboard.
// This does not emulate Safari's keyboard or prove behavior on a physical iPhone.
export async function emulatePhone(page, { width, height, safeArea = width > height ? LANDSCAPE_SAFE_AREA : PORTRAIT_SAFE_AREA }) {
  let cdp = sessions.get(page);
  if (!cdp) {
    cdp = await page.context().newCDPSession(page);
    sessions.set(page, cdp);
  }
  // Apply insets before resizing: the shell must see the new safe area in its
  // resize callback, as it does during a real device rotation.
  await cdp.send('Emulation.setSafeAreaInsetsOverride', { insets: safeArea });
  // Keep Playwright's own viewport bookkeeping aligned (screenshots may restore it).
  await page.setViewportSize({ width, height });
  await cdp.send('Emulation.setDeviceMetricsOverride', {
    width, height, deviceScaleFactor: 3, mobile: true,
    screenWidth: width, screenHeight: height,
    screenOrientation: { type: width > height ? 'landscapePrimary' : 'portraitPrimary', angle: width > height ? 90 : 0 },
  });
  return cdp;
}

export async function expectLandscape(target, active) {
  if (active) await expect(target.locator('html')).toHaveClass(/\bvilda-phone-landscape\b/);
  else await expect(target.locator('html')).not.toHaveClass(/\bvilda-phone-landscape\b/);
}

export async function layoutGeometry(page, frame = page) {
  const host = await page.evaluate(() => {
    const box = selector => {
      const element = document.querySelector(selector);
      if (!element) return null;
      const { x, y, width, height, bottom, right } = element.getBoundingClientRect();
      return { x, y, width, height, bottom, right };
    };
    const dock = document.querySelector('#mobileBottomDock');
    return {
      viewport: { width: innerWidth, height: innerHeight },
      header: box('header'), dock: box('#mobileBottomDock'), panel: box('.app-shell-main'), frame: box('iframe.app-pane:not([hidden])'),
      dockHidden: dock?.classList.contains('is-hidden'),
      headerControls: [...document.querySelectorAll('body > header .chrome-mobile-menu-btn, body > header .chrome-reminders-btn, body > header #vildaPatientChip, body > header .chrome-user-chip.is-logged-in .chip-avatar')].map(el => ({
        width: el.getBoundingClientRect().width, height: el.getBoundingClientRect().height,
      })),
      dockItems: [...document.querySelectorAll('#mobileBottomDock .mobile-bottom-dock__item')].map(el => ({
        width: el.getBoundingClientRect().width, height: el.getBoundingClientRect().height,
      })),
      horizontalOverflow: document.documentElement.scrollWidth - innerWidth,
      scrollY,
    };
  });
  const content = await frame.evaluate(() => {
    const box = selector => {
      const element = document.querySelector(selector);
      if (!element) return null;
      const { x, y, width, height, bottom, right } = element.getBoundingClientRect();
      return { x, y, width, height, bottom, right };
    };
    return {
      viewport: { width: innerWidth, height: innerHeight },
      container: box('.main-content > .container'), form: box('#calcForm'),
      user: box('#userSection'), info: box('#doctorSection'),
      horizontalOverflow: document.documentElement.scrollWidth - innerWidth,
      dockSpacer: Number.parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--vilda-shell-dock-h')) || 0,
      bottomSpace: Number.parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--vilda-dol-wolny')) || 0,
    };
  });
  return { host, content };
}
