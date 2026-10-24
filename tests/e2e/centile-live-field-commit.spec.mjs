import { expect, test } from '../support/test-czas.mjs';
import { createFictionalVault, loadPatient, readyForPatient, shellFrame } from '../support/centile-live-fixture.mjs';

test.use({ serviceWorkers: 'block', reducedMotion: 'reduce' });
test.setTimeout(120_000);

const CARD = '.vilda-centile-live-card';

async function openMeasurement(page, route, shell) {
  await page.setViewportSize({ width: 1536, height: 1120 });
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
  // Observe the real renderer and normal calculator updates. No calculation,
  // snapshot, canvas or result is substituted by the test.
  await owner.evaluate(() => {
    window.__fieldCommitRenders = [];
    window.__fieldCommitUpdates = 0;
    window.__fieldCommitSaves = 0;
    window.__fieldCommitSubmits = 0;
    window.__fieldCommitEnter = [];
    const renderer = window.VildaCentileLiveRender;
    const originalRender = renderer.render;
    renderer.render = function (snapshot) {
      const result = originalRender.apply(this, arguments);
      window.__fieldCommitRenders.push({
        patientId: snapshot.patientId, source: snapshot.source,
        height: snapshot.currentHeight, weight: snapshot.currentWeight,
        history: snapshot.measurements.length,
        heightPoints: result.height?.points.map(point => ({ value: point.value, current: point.current })),
        weightPoints: result.weight?.points.map(point => ({ value: point.value, current: point.current })),
      });
      return result;
    };
    window.VildaUpdateHooks.registerAfterUpdateHook('e2e:field-commit', () => {
      window.__fieldCommitUpdates++;
    }, { order: 100, group: 'e2e' });
    const save = window.VildaVault.savePatient;
    window.VildaVault.savePatient = function () {
      window.__fieldCommitSaves++;
      return save.apply(this, arguments);
    };
    document.getElementById('calcForm').addEventListener('submit', () => { window.__fieldCommitSubmits++; });
    document.addEventListener('keydown', event => {
      if (event.key === 'Enter' && ['height', 'weight'].includes(event.target?.id)) {
        window.__fieldCommitEnter.push({ id: event.target.id, prevented: event.defaultPrevented });
      }
    });
  });
  await loadPatient(owner, fixture.ids.a, 'new', { clear: route === 'docpro' });
  await expect.poll(() => owner.evaluate(() => window.VildaCentileLivePanel?.getState()), { timeout: 30_000 })
    .toMatchObject({ eligible: true, status: 'ready', patientId: fixture.ids.a });
  await expect(owner.locator(CARD)).toBeVisible();
  await expect.poll(() => owner.evaluate(() => window.__fieldCommitRenders.at(-1)))
    .toMatchObject({ height: null, weight: null, history: 5 });
  return { owner, ids: fixture.ids };
}

async function latest(owner) {
  return owner.evaluate(() => window.__fieldCommitRenders.at(-1));
}

async function expectCurrent(owner, height, weight) {
  await expect.poll(() => latest(owner)).toMatchObject({ height, weight, history: 5 });
  const rendered = await latest(owner);
  expect(rendered.heightPoints.filter(point => point.current).map(point => point.value))
    .toEqual(height === null ? [] : [height]);
  expect(rendered.weightPoints.filter(point => point.current).map(point => point.value))
    .toEqual(weight === null ? [] : [weight]);
}

async function settleDraft(page, owner, height, weight, renderCount) {
  // A pause longer than the panel's 100 ms debounce must still not publish a
  // partial value. Then exercise the explicit refresh path, not only listeners.
  await page.waitForTimeout(350);
  await owner.evaluate(() => window.VildaCentileLivePanel.refresh());
  const snapshot = await owner.evaluate(() => window.VildaCentileLiveData.getSnapshot());
  expect({ height: snapshot.currentHeight, weight: snapshot.currentWeight }).toEqual({ height, weight });
  await expectCurrent(owner, height, weight);
  if (renderCount !== undefined) {
    expect(await owner.evaluate(() => window.__fieldCommitRenders.length), 'typing does not redraw the unchanged preview')
      .toBe(renderCount);
  }
}

for (const { route, shell } of [
  { route: 'start', shell: false }, { route: 'docpro', shell: false },
  { route: 'start', shell: true }, { route: 'docpro', shell: true },
]) {
  test(`${shell ? 'SPA' : 'samodzielnie'} ${route}: podgląd zatwierdza wzrost i wagę dopiero po blur lub Enter`, async ({ page }) => {
    const { owner, ids } = await openMeasurement(page, route, shell);
    const height = owner.locator('#height'), weight = owner.locator('#weight');
    await settleDraft(page, owner, null, null);
    const initialRenders = await owner.evaluate(() => window.__fieldCommitRenders.length);
    const updatesBefore = await owner.evaluate(() => window.__fieldCommitUpdates);
    await height.focus();
    for (const digit of ['1', '8', '9']) {
      await height.pressSequentially(digit);
      await settleDraft(page, owner, null, null, initialRenders);
    }
    await expect(height).toHaveValue('189');
    // Normal form data and calculations continue to see the text being edited.
    expect(await owner.evaluate(() => window.collectUserData().user.height)).toBe(189);
    await expect.poll(() => owner.evaluate(() => window.__fieldCommitUpdates)).toBeGreaterThan(updatesBefore);
    expect((await owner.evaluate(() => window.__fieldCommitRenders)).every(row => row.height === null)).toBe(true);

    // Source synchronization while focus stays in the input is another route
    // through after-update; it must also use the previous committed measurement.
    await owner.evaluate(() => {
      const source = document.getElementById('sourcePalczewska');
      source.checked = true;
      source.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await settleDraft(page, owner, null, null);
    await expect(height).toBeFocused();
    await height.press('Tab');
    // Begin the next field immediately, before the 100 ms render debounce.
    // This is variant A: the finished height must not wait for weight's blur.
    await weight.fill('4');
    await settleDraft(page, owner, 189, null);
    await expect.poll(() => latest(owner)).toMatchObject({ source: 'PALCZEWSKA' });
    await weight.pressSequentially('7');
    await settleDraft(page, owner, 189, null);
    await weight.press('Enter');
    await expectCurrent(owner, 189, 47);
    // Enter starts another edit from the just-committed value while keeping the
    // input focused; the next partial value must not bypass the boundary.
    await expect(weight).toBeFocused();
    await weight.fill('48.5');
    await settleDraft(page, owner, 189, 47);
    await weight.blur();
    await expectCurrent(owner, 189, 48.5);

    await height.fill('');
    await settleDraft(page, owner, 189, 48.5);
    await height.press('Enter');
    await expectCurrent(owner, null, 48.5);
    if (route === 'start') {
      await height.fill('159');
      const olaf = owner.locator('#sourceOlaf');
      // A real click blurs the input before the radio's change event. The
      // committed snapshot must include both the finished value and new source.
      await owner.locator('#dataToggleContainer label').filter({ has: olaf }).click();
      await expect(olaf).toBeChecked();
      await expectCurrent(owner, 159, 48.5);
      await expect.poll(() => latest(owner)).toMatchObject({ source: 'OLAF' });
    }
    const sideEffects = await owner.evaluate(() => ({
      saves: window.__fieldCommitSaves, submits: window.__fieldCommitSubmits,
      enter: window.__fieldCommitEnter, currentId: sessionStorage.getItem('vildaCurrentPatientId'),
    }));
    expect(sideEffects).toMatchObject({ saves: 0, submits: 0, currentId: ids.a });
    expect(sideEffects.enter).toEqual([{ id: 'weight', prevented: true }, { id: 'height', prevented: true }]);
    expect(await owner.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    await test.info().attach('field-commit-render-transitions.json', {
      body: JSON.stringify(await owner.evaluate(() => ({ renders: window.__fieldCommitRenders,
        calculatorUpdates: window.__fieldCommitUpdates, enter: window.__fieldCommitEnter })), null, 2),
      contentType: 'application/json',
    });
  });
}

test('podczas edycji blokada pacjenta nadal natychmiast usuwa podgląd; mobile nie otrzymuje panelu', async ({ page }) => {
  const { owner } = await openMeasurement(page, 'start', false);
  await test.info().attach('field-commit-desktop.png', { body: await page.screenshot(), contentType: 'image/png' });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(owner.locator(CARD)).toHaveCount(0);
  expect(await owner.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  await test.info().attach('field-commit-mobile.png', { body: await page.screenshot(), contentType: 'image/png' });
  await page.setViewportSize({ width: 1536, height: 1120 });
  await expect(owner.locator(CARD)).toBeVisible();
  await owner.locator('#height').fill('1');
  await settleDraft(page, owner, null, null);
  await owner.evaluate(() => window.VildaVault.lock());
  await expect(owner.locator(CARD)).toHaveCount(0);
  expect(await owner.evaluate(() => window.VildaCentileLiveData.getSnapshot())).toBeNull();
});
