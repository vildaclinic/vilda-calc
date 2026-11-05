import { expect, test } from '@playwright/test';

test.use({ serviceWorkers: 'block', reducedMotion: 'reduce' });

async function ready(page) {
  await page.goto('/index.html', { waitUntil: 'load' });
  await page.waitForFunction(() => window.VildaNutritionNorms && window.VildaUpdatePrep
    && window.VildaAuthUI?.isBootReady?.() && window.VildaHtml
    && window.macroPracticeGetResources?.()?.dictionary);
  await page.waitForFunction(() => !window.vildaGetNutritionNormsAfterUpdateCoalescingSnapshot().pending
    && !window.vildaGetNutritionNormsDirectRenderCoalescingSnapshot().pending);
  await page.evaluate(() => {
    // Fictional form values, with the real nutrition model and energy engines.
    for (const [id, value] of Object.entries({ age: '40', ageMonths: '0', sex: 'F', weight: '110', height: '165', palFactor: '1.6' })) {
      document.getElementById(id).value = value;
    }
    window.professionalMode = false;
    window.nutritionNormsUiState = { palSelector: '1.6', bodyMode: 'actual', includeInSummary: true };
    window.clearNutritionNormsCard();
    const proof = { commits: [], events: [] };
    window.__normsRenderProof = proof;
    const writer = window.VildaHtml.setTrustedHtml;
    window.VildaHtml.setTrustedHtml = function (element, markup, options) {
      const result = writer.apply(this, arguments);
      if (options?.context === 'nutrition-norms:card' && result) {
        proof.commits.push({ markup, serialized: element.innerHTML, firstChild: element.firstChild });
      }
      return result;
    };
    window.addEventListener('nutritionNormsModelUpdated', event => {
      proof.events.push(JSON.parse(JSON.stringify(event.detail)));
    });
  });
}

async function read(page) {
  return page.evaluate(() => {
    const proof = window.__normsRenderProof;
    return {
      commits: proof.commits.length, events: proof.events,
      model: JSON.parse(JSON.stringify(window.nutritionNormsLastModel)),
      sameFirstChild: proof.commits.length > 0
        && proof.commits[0].firstChild === document.getElementById('nutritionNormsMount').firstChild,
      pending: window.vildaGetNutritionNormsAfterUpdateCoalescingSnapshot().pending,
    };
  });
}

async function hook(page, source = 'window.update') {
  await page.evaluate(async source => {
    window.nutritionNormsRenderAfterUpdate({ source });
    // The production hook owns the first callback; observe after that actual
    // browser frame, without replacing requestAnimationFrame or its scheduler.
    await new Promise(requestAnimationFrame);
  }, source);
  return read(page);
}

test('one public window.update commits nutrition once while its hook publishes the same fresh model', async ({ page }) => {
  await ready(page);
  const synchronous = await page.evaluate(() => {
    window.update();
    // Read in the same task: a separate automation roundtrip may already
    // cross the native frame and observe the hook's second model event.
    return { commits: window.__normsRenderProof.commits.length,
      events: window.__normsRenderProof.events.length,
      model: JSON.parse(JSON.stringify(window.nutritionNormsLastModel)) };
  });
  expect(synchronous.commits).toBe(1);
  expect(synchronous.events).toBe(1);
  await page.evaluate(() => new Promise(requestAnimationFrame));
  const after = await read(page);
  expect(after.commits).toBe(1);
  expect(after.sameFirstChild).toBe(true);
  expect(after.pending).toBe(false);
  expect(after.events).toHaveLength(2);
  expect(after.events[0]).toEqual(after.events[1]);
  expect(after.model).toEqual(synchronous.model);
});

test('public Prep stays synchronous; an explicit direct render still replaces the view and fallback still renders', async ({ page }) => {
  await ready(page);
  await page.evaluate(() => window.VildaUpdatePrep.runMainUpdate());
  const before = await read(page);
  expect(before.commits).toBe(1);
  const after = await hook(page);
  expect(after.commits).toBe(1);
  expect(after.events).toHaveLength(2);
  expect(after.model).toEqual(before.model);
  const direct = await page.evaluate(() => window.renderNutritionNormsCardFromDom());
  expect(direct).toEqual(before.model);
  expect((await read(page)).commits).toBe(2);
  const fallback = await hook(page, 'window.update-fallback');
  expect(fallback.commits).toBe(3);
  expect(fallback.events).toHaveLength(4);
  expect(fallback.model).toEqual(before.model);
});

for (const change of ['PAL source', 'professional mode', 'weight']) {
  test(`${change} changed between Prep and its hook cannot reuse a stale view/model`, async ({ page }) => {
    await ready(page);
    await page.evaluate(() => window.VildaUpdatePrep.runMainUpdate());
    const before = await read(page);
    const expected = await page.evaluate(change => {
      if (change === 'PAL source') {
        window.nutritionNormsUiState.palSelector = 'inherit';
        document.getElementById('palFactor').value = '1.8';
      } else if (change === 'professional mode') window.professionalMode = true;
      else document.getElementById('weight').value = '111';
      return window.nutritionNormsBuildCardModel(window.nutritionNormsReadBasicsFromDom(), window.nutritionNormsGetUiState());
    }, change);
    expect(expected).not.toEqual(before.model);
    const after = await hook(page);
    expect(after.commits).toBe(2);
    expect(after.events).toHaveLength(2);
    expect(after.sameFirstChild).toBe(false);
    expect(after.model).toEqual(expected);
    expect(after.events[1]).toEqual(expected);
  });
}

for (const change of ['control property', 'replacement mount', 'clear card']) {
  test(`${change} invalidates a matching Prep view before the real hook`, async ({ page }) => {
    await ready(page);
    await page.evaluate(() => window.VildaUpdatePrep.runMainUpdate());
    const before = await read(page);
    await page.evaluate(change => {
      const mount = document.getElementById('nutritionNormsMount');
      if (change === 'control property') {
        // A property edit does not change innerHTML. The public renderer must
        // still restore the authoritative current UI state, as before.
        document.getElementById('nutritionNormsPalSelect').value = '1.8';
      } else if (change === 'replacement mount') mount.replaceWith(mount.cloneNode(true));
      else window.clearNutritionNormsCard();
    }, change);
    const after = await hook(page);
    expect(after.commits).toBe(2);
    expect(after.events).toHaveLength(2);
    expect(after.model).toEqual(before.model);
    if (change === 'control property') await expect(page.locator('#nutritionNormsPalSelect')).toHaveValue('1.6');
  });
}

test('hook without any Prep commit renders; non-window contexts keep their existing skip contract', async ({ page }) => {
  await ready(page);
  const skipped = await page.evaluate(() => window.nutritionNormsRenderAfterUpdate({ source: 'patient-report' }));
  expect(skipped).toMatchObject({ skipped: true, reason: 'non-window-update-context' });
  expect((await read(page)).commits).toBe(0);
  const after = await hook(page, 'window.update-fallback');
  expect(after.commits).toBe(1);
  expect(after.events).toHaveLength(1);
  expect(after.model.inputSummary).toContain('110 kg');
});
