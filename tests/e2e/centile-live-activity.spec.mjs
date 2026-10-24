import { expect, test } from '../support/test-czas.mjs';
import { createFictionalVault, loadPatient, readyForPatient, shellFrame } from '../support/centile-live-fixture.mjs';

// Rzeczywiste uwierzytelnianie, sejf i sesje powłoki oraz ramki, wyłącznie
// fikcyjny pacjent. Spy przekazuje do oryginalnego recordActivity; nie zastępuje
// ochrony bezczynności ani renderera klinicznego.
test.use({ serviceWorkers: 'block', reducedMotion: 'reduce', hasTouch: true });
test.setTimeout(150_000);

const DIALOG = '.vilda-centile-live-dialog';
const PLANE = '.vilda-centile-live-interaction:visible';
const IDLE_MS = 10_000;

async function readyPanel(frame, patientId) {
  await expect.poll(() => frame.evaluate(() => window.VildaCentileLivePanel?.getState()), { timeout: 30_000 })
    .toMatchObject({ eligible: true, status: 'ready', patientId });
}

async function expand(page, owner) {
  await owner.evaluate(() => { window.__centileActivityCard = document.querySelector('.vilda-centile-live-card'); });
  await owner.getByRole('button', { name: 'Powiększ siatkę na pełny ekran', exact: true }).click();
  await expect(page.locator(DIALOG)).toBeVisible();
  await expect(owner.locator('.vilda-centile-live-card')).toHaveCount(0);
  expect(await owner.evaluate(() => window.__centileActivityCard.ownerDocument === window.parent.document)).toBe(true);
}

async function openPatientChart(page) {
  await page.setViewportSize({ width: 1536, height: 1120 });
  const { frame, ids } = await createFictionalVault(page, { shell: true });
  await loadPatient(frame, ids.a);
  await readyPanel(frame, ids.a);
  await expand(page, frame);
  return { owner: frame, ids };
}

async function observeActivity(scope) {
  return scope.evaluate(() => {
    window.__centileActivityCalls = 0;
    const api = window.VildaAuthUI;
    if (typeof api?.recordActivity !== 'function') return false;
    const record = api.recordActivity;
    api.recordActivity = function (...args) {
      window.__centileActivityCalls += 1;
      return record.apply(this, args);
    };
    return true;
  });
}

async function resetCalls(scopes) {
  await Promise.all(scopes.map(scope => scope.evaluate(() => { window.__centileActivityCalls = 0; })));
}

async function activityStates(scopes) {
  return Promise.all(scopes.map(scope => scope.evaluate(() => ({
    calls: window.__centileActivityCalls,
    unlocked: window.VildaVault?.isUnlocked(),
    elapsed: window.__centileActivityStart == null ? null : Date.now() - window.__centileActivityStart,
    locks: window.__centileActivityLocks || [],
  }))));
}

async function startIdleWindow(scopes) {
  await Promise.all(scopes.map((scope, index) => scope.evaluate(({ timeout, index }) => {
    const vault = window.VildaVault;
    vault.DEFAULT_IDLE_LOCK_MS = timeout;
    window.__centileActivityLocks = [];
    window.top.sessionStorage.removeItem('__centileActivityIdle' + index);
    vault.onLock(reason => {
      window.__centileActivityLocks.push(reason);
      window.top.sessionStorage.setItem('__centileActivityIdle' + index, reason);
    });
    vault.startIdleTimer(timeout);
    window.__centileActivityStart = Date.now();
  }, { timeout: IDLE_MS, index })));
}

async function expectUnlockedAfterResume(page, scopes) {
  const states = await Promise.all(scopes.map(scope => scope.evaluate(async () => {
    const before = window.VildaVault.isUnlocked();
    document.dispatchEvent(new Event('visibilitychange'));
    dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true }));
    await Promise.resolve();
    return { before, after: window.VildaVault.isUnlocked(), locks: [...window.__centileActivityLocks],
      elapsed: Date.now() - window.__centileActivityStart };
  })));
  for (const state of states) {
    expect(state.elapsed).toBeGreaterThan(IDLE_MS);
    expect(state.before).toBe(true);
    expect(state.after).toBe(true);
    expect(state.locks).toEqual([]);
  }
  await expect(page.locator(DIALOG)).toBeVisible();
}

test('SPA fullscreen: prawdziwy klik, klawiatura i dotyk podtrzymują obie sesje; odczyt i zdarzenia syntetyczne pozwalają na blokadę idle', async ({ page }) => {
  const { owner } = await openPatientChart(page);
  const sourceAvailable = await observeActivity(owner);
  await page.waitForFunction(() => window.VildaVault?.isUnlocked() && typeof window.VildaAuthUI?.recordActivity === 'function');
  expect(await observeActivity(page)).toBe(true);
  expect(sourceAvailable).toBe(true);
  const scopes = [owner, page];
  const dialog = page.locator(DIALOG);
  await dialog.evaluate(element => {
    window.__centileTrustedActivityEvents = [];
    for (const type of ['pointerdown', 'mousedown', 'keydown', 'touchstart', 'touchmove']) {
      element.addEventListener(type, event => {
        if (event.isTrusted) window.__centileTrustedActivityEvents.push({ type, pointerType: event.pointerType || null });
      }, { capture: true, passive: true });
    }
  });
  await startIdleWindow(scopes);

  for (const kind of ['pointer', 'keyboard', 'touch']) {
    await resetCalls([owner, page]);
    for (let index = 0; index < 6; index += 1) {
      if (kind === 'pointer') {
        await dialog.locator(`[data-centile-live-metric="${index % 2 ? 'height' : 'weight'}"]`).click();
      } else if (kind === 'keyboard') {
        await dialog.locator(PLANE).focus();
        await page.keyboard.press(index % 2 ? 'ArrowLeft' : 'ArrowRight');
      } else {
        await dialog.locator(PLANE).tap();
      }
      // Uruchamiamy prawdziwe timery aplikacji kontrolowanym zegarem. Każdy
      // rodzaj wejścia osobno trwa dłużej niż ustawiona granica bezczynności.
      await page.clock.fastForward(2000);
    }
    for (const state of await activityStates(scopes)) {
      expect(state.calls, kind + ': recordActivity właściwej sesji').toBeGreaterThan(0);
      expect(state.unlocked).toBe(true);
      expect(state.locks).toEqual([]);
    }
    await expectUnlockedAfterResume(page, scopes);
  }
  const trusted = await page.evaluate(() => window.__centileTrustedActivityEvents);
  expect(trusted.some(event => event.type === 'pointerdown' && event.pointerType === 'mouse')).toBe(true);
  expect(trusted.some(event => event.type === 'keydown')).toBe(true);
  expect(trusted.some(event => event.type === 'touchstart')).toBe(true);

  await resetCalls([owner, page]);
  await dialog.evaluate(element => {
    for (const type of ['pointerdown', 'mousedown', 'keydown', 'touchstart', 'touchmove', 'wheel', 'scroll']) {
      element.dispatchEvent(new Event(type, { bubbles: true }));
    }
    element.scrollBy(0, 30);
    dispatchEvent(new Event('resize'));
  });
  await owner.evaluate(() => window.VildaCentileLivePanel.refresh());
  await page.setViewportSize({ width: 1500, height: 1100 });
  await page.mouse.move(1490, 1090);
  await page.clock.fastForward(100);
  expect((await activityStates([owner, page])).map(state => state.calls)).toEqual([0, 0]);

  // Bez dalszego wejścia rzeczywista ochrona bezczynności musi nadal zablokować
  // sejf. Odświeżenie i dopasowanie geometrii nie są przedłużeniem sesji.
  await page.clock.fastForward(IDLE_MS + 100);
  await expect.poll(async () => {
    try {
      return await page.evaluate(() => ['__centileActivityIdle0', '__centileActivityIdle1']
        .some(key => sessionStorage.getItem(key) === 'idle'));
    } catch (error) {
      if (/Execution context was destroyed|Cannot find context with specified id/.test(error.message)) return false;
      throw error;
    }
  }, { timeout: 15_000 }).toBe(true);
  await expect(page.locator(DIALOG)).toHaveCount(0);
  await expect.poll(async () => {
    try {
      return await page.evaluate(() => window.VildaVault?.isUnlocked() === false
        && document.querySelectorAll('.vilda-centile-live-scroll-locked').length === 0);
    } catch (error) {
      if (/Execution context was destroyed|Cannot find context with specified id/.test(error.message)) return false;
      throw error;
    }
  }, { timeout: 15_000 }).toBe(true);
  await expect.poll(async () => {
    if (owner.isDetached()) return true;
    try {
      return await owner.evaluate(() => window.VildaVault?.isUnlocked() === false
        && document.querySelectorAll('.vilda-centile-live-card, .vilda-centile-live-scroll-locked').length === 0);
    } catch (error) {
      if (/Execution context was destroyed|Cannot find context with specified id|[Ff]rame (?:was|has been) detached/.test(error.message)) return false;
      throw error;
    }
  }, { timeout: 15_000 }).toBe(true);
});

test('SPA fullscreen: po zamknięciu i przejściu do DocPro aktywność trafia wyłącznie do bieżącej ramki', async ({ page }) => {
  const { owner: start, ids } = await openPatientChart(page);
  expect(await observeActivity(start)).toBe(true);
  await page.waitForFunction(() => window.VildaVault?.isUnlocked() && typeof window.VildaAuthUI?.recordActivity === 'function');
  expect(await observeActivity(page)).toBe(true);
  await page.keyboard.press('Escape');
  await expect(page.locator(DIALOG)).toHaveCount(0);
  await resetCalls([start, page]);
  await page.keyboard.press('Tab');
  expect((await activityStates([start, page])).map(state => state.calls)).toEqual([0, 0]);

  await page.evaluate(() => window.VildaShell.navigate('docpro'));
  const docpro = await shellFrame(page, 'DocPro');
  await readyForPatient(docpro);
  const confirmation = docpro.locator('#professionalConfirmBtn');
  if (await confirmation.isVisible()) await confirmation.click();
  await loadPatient(docpro, ids.a, 'new', { clear: true });
  await readyPanel(docpro, ids.a);
  expect(await observeActivity(docpro)).toBe(true);
  await expand(page, docpro);
  await resetCalls([start, docpro, page]);
  await page.locator(DIALOG).locator(PLANE).focus();
  await page.keyboard.press('Home');
  const [oldSource, source, host] = await activityStates([start, docpro, page]);
  expect(oldSource.calls).toBe(0);
  expect(source.calls).toBeGreaterThan(0);
  expect(host.calls).toBeGreaterThan(0);
  expect(await start.evaluate(() => window.frameElement.hidden)).toBe(true);
});
