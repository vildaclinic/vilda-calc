import { expect, test } from '../support/test-czas.mjs';
import { createFictionalVault, loadPatient, readyForPatient, shellFrame } from '../support/centile-live-fixture.mjs';
import { emulatePhone, expectLandscape } from '../support/telefon-poziomo.mjs';

// Rzeczywisty zapis fikcyjnego pacjenta; nie zastępujemy adaptera ani rysowania
// siatek. Przechwytywanie RAF sprawdza także krótką klatkę Przypomnień, której
// zwykłe oczekiwanie na końcowy stan ready nie byłoby w stanie wykryć.
test.use({ serviceWorkers: 'block', reducedMotion: 'reduce' });
test.setTimeout(150_000);

const TOAST = '#vildaSaveFeedback';
const CARD = '.vilda-centile-live-card';

async function openMeasurement(page, { shell = false, route = 'start', source = 'OLAF' } = {}) {
  const fixture = await createFictionalVault(page, { shell });
  let owner = fixture.frame;
  if (route === 'docpro') {
    if (shell) {
      await page.evaluate(() => window.VildaShell.navigate('docpro'));
      owner = await shellFrame(page, 'DocPro');
    } else {
      await page.goto('/docpro.html', { waitUntil: 'load' });
      owner = page;
    }
    await readyForPatient(owner);
    const confirmation = owner.locator('#professionalConfirmBtn');
    if (await confirmation.isVisible()) await confirmation.click();
  }
  await loadPatient(owner, fixture.ids.a, 'new', { clear: route === 'docpro' });
  await owner.locator('#height').fill('159');
  await owner.locator('#weight').fill('47');
  await owner.locator('#weight').blur();
  await owner.evaluate(selected => {
    const radio = document.querySelector(`input[name="dataSource"][value="${selected}"]`);
    radio.checked = true;
    radio.dispatchEvent(new Event('change', { bubbles: true }));
  }, source);
  await owner.waitForFunction(() => !window.VildaDobAge?.restorePending?.()
    && window.__vildaSuspendAdvIntakeSync !== true
    && window.__vildaSuspendGrowthHistoryCrossSync !== true);
  await owner.waitForFunction(() => typeof window.VildaSaveFeedback?.capture === 'function');
  await owner.evaluate(() => {
    window.__feedbackSaveCalls = 0;
    window.__feedbackSaveSettled = 0;
    const original = window.VildaVault.savePatient;
    window.__feedbackRealSave = original;
    window.VildaVault.savePatient = function (...args) {
      window.__feedbackSaveCalls++;
      const result = original.apply(this, args);
      return Promise.resolve(result).finally(() => { window.__feedbackSaveSettled++; });
    };
  });
  return { owner, ids: fixture.ids };
}

async function readyPanel(owner, patientId, source) {
  await expect.poll(() => owner.evaluate(() => window.VildaCentileLivePanel?.getState()), { timeout: 30_000 })
    .toMatchObject({ eligible: true, status: 'ready', patientId, source });
}

async function observeChart(owner) {
  return owner.evaluate(() => {
    const card = document.querySelector('.vilda-centile-live-card')
      || window.parent.document.querySelector('.vilda-centile-live-dialog .vilda-centile-live-card');
    const baseline = card.getBoundingClientRect();
    const originalState = window.VildaCentileLivePanel.getState();
    const result = {
      frames: 0, removed: 0, fallback: 0, resized: 0, changedView: 0,
      originalState, box: { width: baseline.width, height: baseline.height },
    };
    window.__saveFeedbackObservedCard = card;
    window.__saveFeedbackObservation = result;
    let active = true;
    function sample() {
      if (!active) return;
      result.frames++;
      const current = window.VildaCentileLivePanel.getState();
      const rect = card.getBoundingClientRect();
      if (!card.isConnected || card.hidden) result.removed++;
      if (Math.abs(rect.width - baseline.width) > 1 || Math.abs(rect.height - baseline.height) > 1) result.resized++;
      if (current.metric !== originalState.metric || current.rangeId !== originalState.rangeId
        || current.source !== originalState.source || current.fullscreen !== originalState.fullscreen) result.changedView++;
      const fallback = document.getElementById('remindersInline');
      if (fallback && fallback.getClientRects().length && getComputedStyle(fallback).display !== 'none'
        && getComputedStyle(fallback).visibility !== 'hidden') result.fallback++;
    }
    const observer = new MutationObserver(sample);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    observer.observe(document.getElementById('vildaCentileLiveMount'), { attributes: true, childList: true });
    function frame() { if (active) { sample(); requestAnimationFrame(frame); } }
    requestAnimationFrame(frame);
    window.__stopSaveFeedbackObservation = () => {
      sample(); active = false; observer.disconnect();
      return { ...result, finalState: window.VildaCentileLivePanel.getState(), lifecycle: window.__siatkaE2eLifecycle };
    };
    return originalState;
  });
}

async function expectStableChart(owner) {
  // Pozostawiamy obserwację przez odroczone DOB i odświeżenie siatki, nie tylko
  // do zakończenia Promise sejfu. RAF daje próbki z faktycznie malowanych klatek.
  await owner.evaluate(() => new Promise(resolve => {
    const until = performance.now() + 350;
    function tick() { if (performance.now() >= until) resolve(); else requestAnimationFrame(tick); }
    requestAnimationFrame(tick);
  }));
  const result = await owner.evaluate(() => window.__stopSaveFeedbackObservation());
  await test.info().attach('stan-siatki-podczas-zapisu', { body: JSON.stringify(result, null, 2), contentType: 'application/json' });
  expect(result.frames).toBeGreaterThan(3);
  expect(result.removed, 'zapis zachowuje ten sam węzeł siatki').toBe(0);
  expect(result.fallback, 'Przypomnienia nie są widoczne nawet przez jedną klatkę').toBe(0);
  expect(result.resized, 'komunikat nie zmniejsza pola siatki').toBe(0);
  expect(result.changedView, 'metryka, zakres, źródło i fullscreen pozostają wybrane').toBe(0);
}

async function clickSave(page, owner, { mobile = false } = {}) {
  const before = await owner.evaluate(() => window.__feedbackSaveSettled);
  if (mobile) {
    await page.locator('[data-vilda-chrome-menu-btn]').click();
    await page.locator('[data-drawer-btn="saveDataBtnSidebar"]').click();
    await expect(page.locator('[data-vilda-chrome-drawer]')).toBeHidden();
  } else {
    await page.locator('#saveDataBtnSidebar').click();
  }
  await expect.poll(() => owner.evaluate(() => window.__feedbackSaveSettled)).toBe(before + 1);
  await expect(page.locator(TOAST)).toBeVisible();
  await expect(page.locator(TOAST)).toHaveAttribute('data-state', 'saved');
}

for (const scenario of [
  { shell: false, route: 'start', source: 'OLAF' },
  { shell: false, route: 'docpro', source: 'PALCZEWSKA' },
  { shell: true, route: 'start', source: 'PALCZEWSKA' },
  { shell: true, route: 'docpro', source: 'OLAF' },
]) {
  test(`${scenario.shell ? 'SPA' : 'samodzielnie'} ${scenario.route}: dwa zapisy bez mignięcia Przypomnień i zmiany siatki`, async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 1000 });
    const { owner, ids } = await openMeasurement(page, scenario);
    await readyPanel(owner, ids.a, scenario.source);
    await owner.locator('[data-centile-live-metric="weight"]').click();
    await owner.evaluate(() => scrollTo(0, 0));
    await expect.poll(() => owner.evaluate(() => window.VildaCentileLivePanel.getState().metric)).toBe('weight');
    for (let count = 1; count <= 2; count++) {
      await observeChart(owner);
      await clickSave(page, owner);
      if (count === 1) await page.screenshot({ path: test.info().outputPath('save-success.png') });
      await expectStableChart(owner);
      await expect(owner.locator('#vildaStatusSide')).toBeHidden();
      expect(await owner.evaluate(() => window.__feedbackSaveCalls)).toBe(count);
    }
    await page.clock.fastForward(5100);
    await expect(page.locator(TOAST)).toBeHidden();
    await expect.poll(() => owner.evaluate(() => window.VildaSaveStatusIndicator.getState())).toBe('saved');
    await expect(page.locator('#vildaPatientChip')).toHaveClass(/vilda-save-state--saved/);

    if (scenario.shell && scenario.route === 'docpro') {
      await owner.locator('.vilda-centile-live-expand').click();
      await expect(page.locator('.vilda-centile-live-dialog')).toBeVisible();
      await page.locator('[data-centile-live-metric="both"]').click();
      await owner.evaluate(() => {
        window.__fullscreenBeforeSave = window.parent.document.querySelector('.vilda-centile-live-card');
      });
      await observeChart(owner);
      await owner.evaluate(() => window.saveUserData());
      await expectStableChart(owner);
      await expect(page.locator('.vilda-centile-live-dialog')).toBeVisible();
      await expect.poll(() => owner.evaluate(() => window.VildaCentileLivePanel.getState()))
        .toMatchObject({ fullscreen: true, metric: 'both' });
      expect(await owner.evaluate(() => window.__fullscreenBeforeSave === window.parent.document.querySelector('.vilda-centile-live-card'))).toBe(true);
    }
  });
}

test.describe('C1 na telefonie', () => {
  test.use({ hasTouch: true });
  for (const scenario of [
    { width: 375, height: 812, shell: false, route: 'start' },
    { width: 440, height: 956, shell: true, route: 'start' },
    { width: 956, height: 440, shell: true, route: 'docpro' },
  ]) {
    test(`${scenario.width}px ${scenario.shell ? 'SPA' : 'samodzielnie'}: kapsuła nad Dockiem, zapis nie przewija formularza`, async ({ page }) => {
      await emulatePhone(page, scenario);
      const { owner, ids } = await openMeasurement(page, { ...scenario, source: 'PALCZEWSKA' });
      if (scenario.width > scenario.height) {
        await expectLandscape(page, true);
        await readyPanel(owner, ids.a, 'PALCZEWSKA');
        await owner.locator('[data-centile-live-metric="weight"]').click();
      } else {
        await expect(owner.locator(CARD)).toHaveCount(0);
      }
      await owner.locator('#height').scrollIntoViewIfNeeded();
      await owner.locator('#height').blur();
      const scrollBefore = await owner.evaluate(() => scrollY);
      await clickSave(page, owner, { mobile: true });
      await expect.poll(() => owner.evaluate(() => scrollY)).toBeCloseTo(scrollBefore, 0);
      const geometry = await page.locator(TOAST).evaluate(toast => {
        const rect = element => {
          if (!element) return null;
          const box = element.getBoundingClientRect();
          return { x: box.x, y: box.y, right: box.right, bottom: box.bottom, width: box.width, height: box.height };
        };
        return { toast: rect(toast), dock: rect(document.getElementById('mobileBottomDock')),
          width: innerWidth, height: innerHeight, overflow: document.documentElement.scrollWidth - innerWidth,
          textVisible: getComputedStyle(toast.querySelector('.vilda-save-feedback__text')).display !== 'none' };
      });
      expect(geometry.toast.x).toBeGreaterThanOrEqual(0);
      expect(geometry.toast.right).toBeLessThanOrEqual(geometry.width);
      expect(geometry.toast.bottom).toBeLessThanOrEqual(geometry.dock.y - 4);
      expect(geometry.toast.height).toBeLessThanOrEqual(64);
      expect(geometry.textVisible, 'krótki sukces C1 bez dużej karty tekstowej').toBe(false);
      expect(geometry.overflow).toBeLessThanOrEqual(0);
      if (scenario.shell) await expect(owner.locator(TOAST)).toHaveCount(0);
      await expect(page.locator(TOAST)).toContainText('Zapisano');
      await expect(page.locator(TOAST).locator('.vilda-save-feedback__time')).toHaveText(/\d{2}:\d{2}/);
      // Screenshot capture can change emulated scrollbar gutters in Chromium;
      // collect the visual artifact after the behavioral assertions.
      await page.screenshot({ path: test.info().outputPath('save-success-mobile.png') });
    });
  }

  test('SPA: kapsuła uwzględnia klawiaturę hosta, a nie wysokość ramki formularza', async ({ page }) => {
    await emulatePhone(page, { width: 440, height: 956 });
    const { owner } = await openMeasurement(page, { shell: true });
    await owner.locator('#height').focus();
    await page.evaluate(() => {
      Object.defineProperty(visualViewport, 'height', { configurable: true, get: () => 460 });
      visualViewport.dispatchEvent(new Event('resize'));
    });
    await owner.evaluate(() => window.saveUserData());
    await expect(page.locator(TOAST)).toBeVisible();
    await expect(page.locator(TOAST)).toHaveAttribute('data-state', 'saved');
    await expect.poll(async () => (await page.locator(TOAST).boundingBox()).y
      + (await page.locator(TOAST).boundingBox()).height).toBeLessThanOrEqual(460);
    await expect(owner.locator('#height')).toBeFocused();
    await expect(owner.locator(TOAST)).toHaveCount(0);
  });
});

test('wolny zapis scala ponowne wywołanie, błąd pozostaje z Ponów, a ponowienie wykonuje rzeczywisty zapis', async ({ page }) => {
  const { owner } = await openMeasurement(page);
  await owner.evaluate(() => {
    const original = window.VildaVault.savePatient;
    window.__delayedSaveCalls = 0;
    window.VildaVault.savePatient = async function (...args) {
      window.__delayedSaveCalls++;
      await new Promise(resolve => { window.__releaseSave = resolve; });
      return original.apply(this, args);
    };
    window.__pendingSave1 = window.saveUserData();
    window.__pendingSave2 = window.saveUserData();
  });
  await expect.poll(() => owner.evaluate(() => window.__delayedSaveCalls)).toBe(1);
  await expect(page.locator(TOAST)).toHaveAttribute('data-state', 'saving');
  await owner.evaluate(async () => { window.__releaseSave(); await Promise.all([window.__pendingSave1, window.__pendingSave2]); });
  await expect(page.locator(TOAST)).toHaveAttribute('data-state', 'saved');

  await owner.evaluate(() => {
    window.VildaVault.savePatient = async () => { throw new Error('Fikcyjny błąd zapisu E2E'); };
    return window.saveUserData();
  });
  await expect(page.locator(TOAST)).toHaveAttribute('data-state', 'error');
  await expect(page.locator(TOAST)).toContainText('Fikcyjny błąd zapisu E2E');
  await page.clock.fastForward(6100);
  await expect(page.locator(TOAST)).toBeVisible();
  await expect(owner.locator('#height')).toHaveValue('159');
  await expect(owner.locator('#weight')).toHaveValue('47');
  await owner.evaluate(() => { window.VildaVault.savePatient = window.__feedbackRealSave; });
  await page.locator('#vildaSaveFeedbackRetry').click();
  await expect(page.locator(TOAST)).toHaveAttribute('data-state', 'saved');
});

test('SPA: spóźniony błąd ukrytej ramki nie trafia do nowej strony ani na jej chip', async ({ page }) => {
  const { owner } = await openMeasurement(page, { shell: true });
  await owner.evaluate(() => {
    window.VildaVault.savePatient = () => new Promise((resolve, reject) => { window.__rejectOldSave = reject; });
    window.__oldSave = window.saveUserData();
  });
  await expect(page.locator(TOAST)).toHaveAttribute('data-state', 'saving');
  await page.evaluate(() => window.VildaShell.navigate('docpro'));
  const docpro = await shellFrame(page, 'DocPro');
  await readyForPatient(docpro);
  const confirmation = docpro.locator('#professionalConfirmBtn');
  if (await confirmation.isVisible()) await confirmation.click();
  await expect(page.locator(TOAST)).toBeHidden();
  await owner.evaluate(async () => { window.__rejectOldSave(new Error('Fikcyjny spóźniony błąd E2E')); await window.__oldSave; });
  await expect(page.locator(TOAST)).toBeHidden();
  expect(await docpro.evaluate(() => window.VildaSaveStatusIndicator.getState())).not.toBe('error');
});

test('edycja podczas wolnego zapisu zachowuje oba pomiary w sejfie i potwierdza tylko nowszy zapis', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  const { owner, ids } = await openMeasurement(page);
  const snapshotCount = await owner.evaluate(async id => (await window.VildaVault.getPatient(id)).snapshots.length, ids.a);
  await owner.evaluate(() => {
    const original = window.VildaVault.savePatient;
    window.__editedSaveCalls = [];
    window.__editedSaveRelease = [];
    window.__editedSaveOutcomes = [];
    window.__editedSaveAcknowledgements = 0;
    window.VildaVault.savePatient = async function (...args) {
      const index = window.__editedSaveCalls.length;
      window.__editedSaveCalls.push(JSON.parse(JSON.stringify(args[0])));
      await new Promise(resolve => { window.__editedSaveRelease[index] = resolve; });
      // Only delay the call; encryption, merge and storage are the real vault.
      const result = await original.apply(this, args);
      window.__editedSaveOutcomes[index] = result;
      return result;
    };
    window.__editedSaveObserver = new MutationObserver(records => {
      for (const record of records) for (const added of record.addedNodes) {
        if (added.nodeType === Node.ELEMENT_NODE && added.id === 'vildaSaveFeedback'
          && added.dataset.state === 'saved') window.__editedSaveAcknowledgements++;
      }
    });
    window.__editedSaveObserver.observe(document.body, { childList: true });
  });

  await page.locator('#saveDataBtnSidebar').click();
  await expect.poll(() => owner.evaluate(() => window.__editedSaveCalls.length)).toBe(1);
  await expect(page.locator(TOAST)).toHaveAttribute('data-state', 'saving');
  const firstEditRevision = await owner.evaluate(() => window.VildaSaveFeedback.capture().editRevision);
  await owner.locator('#height').fill('160');
  await owner.locator('#height').blur();
  expect(await owner.evaluate(() => window.VildaSaveFeedback.capture().editRevision)).toBeGreaterThan(firstEditRevision);
  await expect(page.locator(TOAST)).toBeHidden();
  await page.locator('#saveDataBtnSidebar').click();
  await expect.poll(() => owner.evaluate(() => window.__editedSaveCalls.length)).toBe(2);
  expect(await owner.evaluate(() => window.__editedSaveCalls.map(data => data.user.height))).toEqual([159, 160]);
  await expect(page.locator(TOAST)).toHaveAttribute('data-state', 'saving');

  await owner.evaluate(() => { window.__editedSaveRelease[0](); });
  await expect.poll(() => owner.evaluate(() => window.__feedbackSaveSettled)).toBe(1);
  await expect.poll(() => owner.evaluate(() => Boolean(window.__editedSaveOutcomes[0]))).toBe(true);
  await expect(page.locator(TOAST)).toHaveAttribute('data-state', 'saving');
  expect(await owner.evaluate(() => window.__editedSaveAcknowledgements)).toBe(0);
  await expect(owner.locator('#height')).toHaveValue('160');
  expect(await owner.evaluate(async id => (await window.VildaVault.getPatient(id)).snapshots[0].payload.user.height, ids.a)).toBe(159);

  await owner.evaluate(() => { window.__editedSaveRelease[1](); });
  await expect.poll(() => owner.evaluate(() => window.__feedbackSaveSettled)).toBe(2);
  await expect(page.locator(TOAST)).toHaveAttribute('data-state', 'saved');
  await expect.poll(() => owner.evaluate(() => window.__editedSaveAcknowledgements)).toBe(1);
  const saved = await owner.evaluate(async id => {
    const record = await window.VildaVault.getPatient(id);
    return { count: record.snapshots.length, heights: record.snapshots.slice(0, 2).map(snapshot => snapshot.payload.user.height) };
  }, ids.a);
  expect(saved).toEqual({ count: snapshotCount + 2, heights: [160, 159] });
  await expect.poll(() => owner.evaluate(() => window.VildaSaveStatusIndicator.getState())).toBe('saved');
  expect(await owner.evaluate(() => window.__editedSaveOutcomes.map(result => result.patientId))).toEqual([ids.a, ids.a]);
  await owner.evaluate(() => { window.__editedSaveObserver.disconnect(); });
});
