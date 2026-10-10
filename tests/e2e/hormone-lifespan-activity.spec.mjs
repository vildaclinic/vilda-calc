import { expect, test } from '../support/test-czas.mjs';

// Exercise the production authentication, vault, converter and app shell with
// a newly created fictional account. The chart moves to the shell document in
// fullscreen, while the session and its inactivity timestamp belong to the
// converter frame. Both must still see actual user activity.
test.use({ serviceWorkers: 'block', reducedMotion: 'reduce' });

const idleMs = 3000;
const dialog = page => page.locator('dialog.vhl-fullscreen-dialog');

async function openAuthenticatedChart(page, framed) {
  await page.setViewportSize({ width: 1100, height: 600 });
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
  await page.evaluate(() => window.VildaVault.createUser('E2e#ChartActivity!2026', {
    label: 'Fikcyjny sejf aktywności wykresu', iterations: 10000,
  }));
  await page.reload({ waitUntil: 'load' });
  await page.waitForFunction(() => window.VildaVault?.isUnlocked());
  let owner = page;
  if (framed) {
    await page.goto('/app.html#/lab', { waitUntil: 'load' });
    const frame = page.locator('iframe.app-pane[title="Jednostki laboratoryjne"]');
    await expect(frame).toBeVisible();
    owner = await (await frame.elementHandle()).contentFrame();
    if (!owner) throw new Error('Missing production converter frame');
    await owner.waitForLoadState('load');
  }
  await owner.waitForFunction(() => window.VildaVault?.isUnlocked() && window.VildaAuthUI
    && window.VildaHormoneLifespanRuntime && window.VildaPersistence
    && !document.documentElement.classList.contains('vilda-auth-locked'));
  for (const scope of new Set([page, owner])) {
    const consent = scope.locator('#consent-decline');
    if (await consent.isVisible()) await consent.click();
  }
  await owner.evaluate(() => {
    if (!window.VildaPersistence.writeShared({ name: 'Fikcyjny pacjent aktywności', sex: 'M', age: 14, ageMonths: 0 }, { force: true })) {
      throw new Error('Cannot seed fictional chart patient');
    }
    document.dispatchEvent(new CustomEvent('vilda:session-changed'));
  });
  await owner.locator('#labSubstance').fill('LH');
  await owner.locator('#labSubstanceDropdown [data-id="lh"]').click();
  await owner.locator('#labValue').fill('2');
  await expect(owner.locator('.vilda-hormone-lifespan')).toBeVisible();
  await owner.locator('.vhl-expand').click();
  await expect(dialog(page)).toBeVisible();
  return owner;
}

async function startShortIdleWindow(page, owner) {
  for (const scope of new Set([page, owner])) {
    await scope.waitForFunction(() => window.VildaVault?.isUnlocked() && window.VildaAuthUI);
    await scope.evaluate(({ timeout, key }) => {
      // Ba() in AuthUI reads this public setting for return-from-background
      // checks. Shorten it alongside the vault timer, without replacing either.
      window.VildaVault.DEFAULT_IDLE_LOCK_MS = timeout;
      window.__chartActivityLocks = [];
      window.top.sessionStorage.removeItem(key);
      window.VildaVault.onLock(reason => {
        window.__chartActivityLocks.push(reason);
        // Production lock can navigate the converter to index.html. Preserve
        // this test-only observation across that legitimate navigation.
        window.top.sessionStorage.setItem(key, reason);
      });
      window.VildaVault.startIdleTimer(timeout);
      window.__chartActivityStart = Date.now();
    }, { timeout: idleMs, key: scope === page ? '__chartActivityTopLock' : '__chartActivityOwnerLock' });
  }
}

async function expectActiveAfterResume(page, owner) {
  for (const scope of new Set([page, owner])) {
    expect(await scope.evaluate(() => Date.now() - window.__chartActivityStart)).toBeGreaterThan(idleMs);
    expect(await scope.evaluate(() => window.VildaVault.isUnlocked())).toBe(true);
    // The shell and converter have separate timers AND last-activity values.
    // Resetting only the timer is insufficient when either document resumes.
    await scope.evaluate(() => {
      document.dispatchEvent(new Event('visibilitychange'));
      dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true }));
    });
    expect(await scope.evaluate(() => window.VildaVault.isUnlocked())).toBe(true);
    expect(await scope.evaluate(() => window.__chartActivityLocks)).toEqual([]);
  }
  await expect(dialog(page)).toBeVisible();
}

async function expectIdleLock(page, owner) {
  // Read-only refreshes and rendering are not user activity. They must neither
  // keep the session alive nor postpone its normal inactivity protection.
  await owner.evaluate(() => {
    let refresh = 0;
    window.__chartRefresh = setInterval(() => {
      document.dispatchEvent(new CustomEvent('vilda:session-changed'));
      // Programmatic scrolling emits a trusted scroll event in Chromium. It
      // still is not a person's wheel, touch or keyboard interaction.
      const expanded = window.top.document.querySelector('dialog.vhl-fullscreen-dialog');
      if (expanded) expanded.scrollBy(0, ++refresh % 2 ? 70 : -70);
    }, 250);
  });
  await page.waitForFunction(() => ['__chartActivityTopLock', '__chartActivityOwnerLock']
    .some(key => sessionStorage.getItem(key) === 'idle'), {}, { timeout: idleMs * 3 });
  await page.waitForLoadState('load');
  await expect(dialog(page)).toHaveCount(0);
  expect(await page.evaluate(() => document.querySelectorAll('.vhl-scroll-locked').length)).toBe(0);
  expect(await page.evaluate(() => Boolean(window.VildaVault?.isUnlocked()))).toBe(false);
  if (owner === page || !owner.isDetached()) {
    await owner.waitForLoadState('load');
    await owner.evaluate(() => clearInterval(window.__chartRefresh));
    await expect(owner.locator('.vilda-hormone-lifespan')).toBeHidden();
    expect(await owner.evaluate(() => document.querySelectorAll('.vhl-scroll-locked').length)).toBe(0);
    expect(await owner.evaluate(() => Boolean(window.VildaVault?.isUnlocked()))).toBe(false);
  }
}

for (const framed of [false, true]) {
  test(`${framed ? 'app shell' : 'standalone'} fullscreen clicks and keyboard keep the session active, then real inactivity locks it`, async ({ page }) => {
    const owner = await openAuthenticatedChart(page, framed);
    await startShortIdleWindow(page, owner);
    for (const input of ['pointer', 'keyboard']) {
      // Each input type on its own lasts longer than the inactivity limit.
      // Alternating them would let a working pointer handler mask a broken
      // keyboard handler (or the reverse).
      for (let i = 0; i < 12; i += 1) {
        const button = dialog(page).locator(`[data-view="${i % 2 ? 'life' : 'puberty'}"]`);
        if (input === 'keyboard') {
          await button.focus();
          await page.keyboard.press('Enter');
        } else {
          await button.click();
        }
        await expect(button).toHaveAttribute('aria-pressed', 'true');
        await page.waitForTimeout(300);
      }
      await expectActiveAfterResume(page, owner);
    }
    await expectIdleLock(page, owner);
  });

  test(`${framed ? 'app shell' : 'standalone'} fullscreen scrolling keeps the session active, then real inactivity locks it`, async ({ page }) => {
    const owner = await openAuthenticatedChart(page, framed);
    await dialog(page).locator('.vhl-sources > summary').click();
    await expect.poll(() => dialog(page).evaluate(el => el.scrollHeight - el.clientHeight)).toBeGreaterThan(200);
    await page.mouse.move(550, 430);
    await startShortIdleWindow(page, owner);
    for (let i = 0; i < 12; i += 1) {
      const before = await dialog(page).evaluate(el => el.scrollTop);
      await page.mouse.wheel(0, i % 2 ? -160 : 160);
      await expect.poll(() => dialog(page).evaluate(el => el.scrollTop)).not.toBe(before);
      await page.waitForTimeout(300);
    }
    await expectActiveAfterResume(page, owner);
    await expectIdleLock(page, owner);
  });
}
