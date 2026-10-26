import { expect, test } from '@playwright/test';
import { createFictionalVault, loadPatient } from '../support/centile-live-fixture.mjs';

// Natywne klatki i zadania przeglądarki: zamrożony zegar ukryłby blokowanie
// pierwszego malowania. Wszyscy pacjenci pochodzą z fikcyjnego sejfu fixture.
test.use({ serviceWorkers: 'block', contextOptions: { reducedMotion: 'reduce' } });
test.setTimeout(120_000);

const CARD = '.vilda-centile-live-card';
const DIALOG = '.vilda-centile-live-dialog';

async function ready(page, patientId) {
  await expect.poll(() => page.evaluate(() => window.VildaCentileLivePanel?.getState()), { timeout: 30_000 })
    .toMatchObject({ status: 'ready', patientId });
  await expect(page.locator(`${CARD} svg.vilda-centile-live-preview`)).toBeVisible();
}

async function frames(page, count = 4) {
  await page.evaluate(count => new Promise(resolve => {
    function next() { if (--count <= 0) resolve(); else requestAnimationFrame(next); }
    requestAnimationFrame(next);
  }), count);
}

function installPreparationProbe() {
  const results = [];
  const canvasOwners = new WeakMap();
  const readback = CanvasRenderingContext2D.prototype.getImageData;
  let renderer, drawing = null;
  window.__centilePreparationProbe = results;
  function visible(element) {
    if (!element || !element.isConnected || !element.getClientRects().length) return false;
    for (let parent = element; parent; parent = parent.parentElement) {
      const style = getComputedStyle(parent);
      if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) === 0) return false;
    }
    return true;
  }
  Object.defineProperty(window, 'VildaCentileLiveRender', {
    configurable: true,
    get() { return renderer; },
    set(value) {
      renderer = { ...value, render(...args) {
        const result = { frames: 0, reads: [], assets: [], complete: false };
        results.push(result);
        drawing = result;
        let output;
        try { output = value.render(...args); }
        finally { drawing = null; }
        for (const range of output.ranges || []) for (const metric of ['height', 'weight']) {
          const asset = range[metric];
          if (!asset?.canvas) continue;
          result.assets.push({ metric, rangeId: range.id, canvas: asset.canvas });
          canvasOwners.set(asset.canvas, result);
        }
        result.eagerMetrics = result.assets.map(asset => asset.metric);
        function paint() {
          if (result.assets.some(asset => visible(asset.canvas))) result.frames += 1;
          if (!result.complete) requestAnimationFrame(paint);
        }
        requestAnimationFrame(paint);
        return output;
      }, prepareContentBounds(...args) {
        const result = results.find(item => item.assets.some(asset => asset.canvas === args[0].height?.canvas));
        const handle = value.prepareContentBounds(...args);
        handle.promise.then(outcome => { if (result) { result.complete = true; result.status = outcome.status; } });
        return handle;
      } };
    },
  });
  CanvasRenderingContext2D.prototype.getImageData = function (...args) {
    const result = drawing || canvasOwners.get(this.canvas);
    if (result) result.reads.push({ frames: result.frames, width: args[2], height: args[3],
      canvasWidth: this.canvas.width, canvasHeight: this.canvas.height, synchronousRender: Boolean(drawing) });
    return readback.apply(this, args);
  };
}

for (const reducedMotion of ['reduce', 'no-preference']) test.describe(`pierwsze malowanie (${reducedMotion})`, () => {
  test.use({ contextOptions: { reducedMotion } });
  test('Start: lekki SVG nie przygotowuje pełnych grafik ani marginesów przed powiększeniem', async ({ page }) => {
    expect(await page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches)).toBe(reducedMotion === 'reduce');
    await page.addInitScript(installPreparationProbe);
    const { ids } = await createFictionalVault(page);
    await loadPatient(page, ids.a);
    await ready(page, ids.a);
    await frames(page, 12);
    await expect(page.locator(`${CARD} canvas`)).toHaveCount(0);
    expect(await page.evaluate(() => window.__centilePreparationProbe)).toEqual([]);
    const preview = page.locator(`${CARD} svg.vilda-centile-live-preview`);
    await expect(preview.locator('.vilda-centile-live-preview-centile')).toHaveCount(3);
    expect(await preview.locator('.vilda-centile-live-preview-centile').evaluateAll(paths => paths.map(path => path.dataset.centile)))
      .toEqual(['3', '50', '97']);
    await page.locator(`${CARD} [data-centile-live-metric="weight"]`).click();
    await expect(preview).toBeVisible();
    await frames(page, 12);
    expect(await page.evaluate(() => window.__centilePreparationProbe), 'zmiana parametru także nie rozgrzewa pełnego renderera').toEqual([]);
    await expect(page.locator('#remindersInline')).toBeHidden();
    await page.locator(`${CARD} .vilda-centile-live-expand`).click();
    await expect(page.locator(DIALOG)).toBeVisible();
    await expect.poll(() => page.evaluate(() => window.__centilePreparationProbe.some(result => result.status === 'ready')))
      .toBe(true);
    const observed = await page.evaluate(() => window.__centilePreparationProbe.map(({ assets, ...result }) => result));
    const completed = observed.filter(result => result.status === 'ready');
    expect(completed.length).toBeGreaterThan(0);
    for (const result of completed) {
      expect(result.eagerMetrics).toEqual(['height', 'weight']);
      expect(result.reads.length).toBeGreaterThan(1);
      expect(result.reads.some(read => read.synchronousRender), 'rysowanie nie wykonuje synchronicznego skanowania całego obrazu').toBe(false);
      expect(result.reads.every(read => read.height < read.canvasHeight), 'odczyt marginesów podzielony na pasy').toBe(true);
    }
    await page.locator(`${DIALOG} [data-centile-live-metric="both"]`).click();
    await expect(page.locator(`${DIALOG} .vilda-centile-live-image:visible`)).toHaveCount(2);
    await expect(page.locator(`${DIALOG} canvas.vilda-centile-live-full-background:visible`)).toHaveCount(2);
    await expect(page.locator(`${DIALOG} svg.vilda-centile-live-full-svg:visible`)).toHaveCount(2);
    await page.locator(`${DIALOG} .vilda-centile-live-close`).click();
    await expect(page.locator(DIALOG)).toHaveCount(0);
    await expect(preview).toBeVisible();
    await expect(page.locator(`${CARD} canvas`)).toHaveCount(0);
  });
});

const explicitSnapshot = {
  sex: 'M', ageMonths: 158, exactAgeMonths: 158.2, currentHeight: null, currentWeight: null,
  professionalMode: true, source: 'OLAF',
  measurements: [{ ageMonths: 84, height: 123.6, weight: 23.9 },
    { ageMonths: 108, height: 135, weight: 29.9 }, { ageMonths: 120, height: 141, weight: 33 },
    { ageMonths: 144, height: 152.2, weight: 40 }],
  advanced: { motherHeight: 165, fatherHeight: 180 },
  chartCreatorData: { growth: { version: 1, shared: {}, layout: { height: {}, weight: {} },
    free: { height: [{ id: 901, ageMonths: 120, value: 141, txt: 'E2E poza siatką', arrow: true,
      frame: { ageMonths: 255, value: 220 } }], weight: [] } } },
};

test('OLAF i oba zakresy Palczewskiej: asynchroniczne kadrowanie zachowuje wszystkie piksele i wysuniętą adnotację', async ({ page }) => {
  await page.goto('/index.html', { waitUntil: 'load' });
  await page.waitForFunction(() => window.VildaCentileLiveRender?.prepareContentBounds);
  const results = await page.evaluate(async snapshot => {
    const api = window.VildaCentileLiveRender;
    const before = JSON.stringify(snapshot);
    const rows = [];
    async function hash(asset) {
      const bytes = asset.canvas.getContext('2d').getImageData(0, 0, asset.width, asset.height).data;
      return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))).join(',');
    }
    for (const source of ['OLAF', 'PALCZEWSKA']) {
      const input = { ...snapshot, source, measurements: source === 'PALCZEWSKA'
        ? [{ ageMonths: 6, height: 67, weight: 7.5 }, ...snapshot.measurements] : snapshot.measurements };
      const original = api.render(input);
      const deferred = api.render(input, { deferContentBounds: true });
      const initial = deferred.ranges.flatMap(range => ['height', 'weight'].map(metric => range[metric].contentBounds));
      const outcome = await api.prepareContentBounds(deferred, { isCurrent: () => true }).promise;
      const assets = [];
      for (const [index, range] of deferred.ranges.entries()) for (const metric of ['height', 'weight']) {
        const asset = range[metric], expected = original.ranges[index][metric];
        assets.push({ range: range.id, metric, bounds: asset.contentBounds, expectedBounds: expected.contentBounds,
          samePixels: await hash(asset) === await hash(expected), width: asset.width, height: asset.height,
          annotations: asset.annotations.length });
      }
      rows.push({ source, status: outcome.status, initial, assets, plan: deferred.rangePlan?.mode });
    }
    return { rows, unchanged: JSON.stringify(snapshot) === before };
  }, explicitSnapshot);
  expect(results.unchanged).toBe(true);
  expect(results.rows[1].plan).toBe('BOTH_REQUIRED');
  expect(results.rows[1].assets).toHaveLength(4);
  for (const row of results.rows) {
    expect(row.initial.every(bounds => bounds === null)).toBe(true);
    expect(row.status).toBe('ready');
    for (const asset of row.assets) {
      expect(asset.bounds, `${row.source}/${asset.range}/${asset.metric}`).toEqual(asset.expectedBounds);
      expect(asset.samePixels).toBe(true);
      expect(asset.bounds.x + asset.bounds.width).toBeLessThanOrEqual(asset.width);
      expect(asset.bounds.y + asset.bounds.height).toBeLessThanOrEqual(asset.height);
    }
    expect(row.assets.some(asset => asset.metric === 'height' && asset.annotations > 0 && asset.width > 2296),
      'przypadek obejmuje adnotację wystającą poza zwykły canvas').toBe(true);
  }
});

// Wstrzymujemy jedynie dostarczenie wyniku rzeczywistego preparera. Dzięki temu
// kliknięcie przed końcem i późne zakończenie po blokadzie są deterministyczne.
async function holdPreparation(page) {
  await page.evaluate(() => {
    const api = window.VildaCentileLiveRender;
    const prepare = api.prepareContentBounds;
    window.__heldCentilePreparations = [];
    let release;
    // Po zwolnieniu przepuszczamy także kolejne odświeżenia: mogą zastąpić
    // poprzedni wynik już po jednorazowym wywołaniu release w teście.
    const gate = new Promise(resolve => { release = resolve; });
    api.prepareContentBounds = function (...args) {
      const actual = prepare.apply(this, args);
      const item = { actual, cancelled: 0, prioritized: 0, release, outcome: null };
      window.__heldCentilePreparations.push(item);
      return {
        promise: actual.promise.then(async result => { item.outcome = result.status; await gate; return result; }),
        cancel() { item.cancelled += 1; actual.cancel(); },
        prioritize() { item.prioritized += 1; actual.prioritize(); },
      };
    };
  });
}

async function waitPreparation(page) {
  await expect.poll(() => page.evaluate(() => window.__heldCentilePreparations.length)).toBeGreaterThan(0);
}

test('wczesne powiększenie czeka na dokładny kadr i otwiera raz stabilny widok obu siatek', async ({ page }) => {
  const { ids } = await createFictionalVault(page);
  await holdPreparation(page);
  await loadPatient(page, ids.a);
  await ready(page, ids.a);
  expect(await page.evaluate(() => window.__heldCentilePreparations.length)).toBe(0);
  await page.locator('.vilda-centile-live-expand').click();
  await waitPreparation(page);
  await expect.poll(() => page.evaluate(() => window.__heldCentilePreparations.some(item => item.prioritized > 0))).toBe(true);
  await expect(page.locator(DIALOG)).toHaveCount(0);
  await page.evaluate(() => { for (const item of window.__heldCentilePreparations) item.release(); });
  await expect(page.locator(DIALOG)).toBeVisible();
  await expect(page.locator(DIALOG)).toHaveCount(1);
  await page.locator(`${DIALOG} [data-centile-live-metric="both"]`).click();
  await expect(page.locator(`${DIALOG} .vilda-centile-live-image:visible`)).toHaveCount(2);
  const geometry = () => page.locator(`${DIALOG} .vilda-centile-live-image`).evaluateAll(canvases => canvases
    .map(canvas => ({ width: canvas.style.width, height: canvas.style.height, left: canvas.style.left, top: canvas.style.top })));
  const before = await geometry();
  await frames(page, 8);
  expect(await geometry()).toEqual(before);
});

for (const action of ['clear', 'lock']) test(`oczekujące powiększenie jest anulowane przez ${action} i późny wynik nie pokazuje poprzedniego pacjenta`, async ({ page }) => {
  const { ids } = await createFictionalVault(page);
  await holdPreparation(page);
  await loadPatient(page, ids.a);
  await ready(page, ids.a);
  expect(await page.evaluate(() => window.__heldCentilePreparations.length)).toBe(0);
  await page.locator('.vilda-centile-live-expand').click();
  await waitPreparation(page);
  await expect.poll(() => page.evaluate(() => window.__heldCentilePreparations.some(item => item.prioritized > 0))).toBe(true);
  await page.evaluate(action => { if (action === 'lock') window.VildaVault.lock(); else window.clearAllData(); }, action);
  await expect(page.locator(CARD)).toHaveCount(0);
  const cancelled = await page.evaluate(() => window.__heldCentilePreparations.some(item => item.cancelled > 0));
  expect(cancelled).toBe(true);
  await page.evaluate(() => { for (const item of window.__heldCentilePreparations) item.release(); });
  await frames(page);
  await expect(page.locator(DIALOG)).toHaveCount(0);
  await expect(page.locator(CARD)).toHaveCount(0);
});

test('odświeżenie pełnego ekranu zachowuje poprzedni kadr do gotowości nowego obrazu', async ({ page }) => {
  const { ids } = await createFictionalVault(page);
  await loadPatient(page, ids.a);
  await ready(page, ids.a);
  await page.locator('.vilda-centile-live-expand').click();
  await expect(page.locator(DIALOG)).toBeVisible();
  await frames(page);
  await holdPreparation(page);
  await page.evaluate(() => {
    window.__oldFullscreenCanvas = document.querySelector('.vilda-centile-live-image');
    window.chartCreatorData.growth.free.height.push({ id: 9902, ageMonths: 120, value: 141,
      txt: 'E2E odświeżenie', arrow: true, frame: { ageMonths: 255, value: 220 } });
    document.dispatchEvent(new CustomEvent('vilda:centile-creator-changed'));
  });
  await waitPreparation(page);
  await expect(page.locator(DIALOG)).toBeVisible();
  expect(await page.evaluate(() => document.querySelector('.vilda-centile-live-image') === window.__oldFullscreenCanvas)).toBe(true);
  await page.evaluate(() => { for (const item of window.__heldCentilePreparations) item.release(); });
  await expect.poll(() => page.evaluate(() => document.querySelector('.vilda-centile-live-image') !== window.__oldFullscreenCanvas)).toBe(true);
  await expect(page.locator(DIALOG)).toBeVisible();
  const style = () => page.locator(`${DIALOG} .vilda-centile-live-image`).evaluate(canvas => canvas.getAttribute('style'));
  const after = await style();
  await frames(page, 8);
  expect(await style()).toBe(after);
});

test('zmiana źródła podczas przygotowywania anuluje stare powiększenie, a ponowienie używa aktualnej siatki', async ({ page }) => {
  const { ids } = await createFictionalVault(page);
  await holdPreparation(page);
  await loadPatient(page, ids.a);
  await ready(page, ids.a);
  await page.locator('.vilda-centile-live-expand').click();
  await waitPreparation(page);
  await page.evaluate(() => {
    const source = document.getElementById('sourcePalczewska');
    source.checked = true;
    source.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await expect.poll(() => page.evaluate(() => window.VildaCentileLivePanel.getState().source)).toBe('PALCZEWSKA');
  await expect.poll(() => page.evaluate(() => window.__heldCentilePreparations.some(item => item.cancelled > 0))).toBe(true);
  await page.evaluate(() => { for (const item of window.__heldCentilePreparations) item.release(); });
  await frames(page, 8);
  await expect(page.locator(DIALOG)).toHaveCount(0);
  await expect(page.locator(`${CARD} svg.vilda-centile-live-preview`)).toBeVisible();
  await expect(page.locator(`${CARD} .vilda-centile-live-source`)).toContainText('Palczewska');
  await page.locator('.vilda-centile-live-expand').click();
  await expect(page.locator(DIALOG)).toBeVisible();
  await expect(page.locator(`${DIALOG} .vilda-centile-live-source`)).toContainText('Palczewska');
  await expect(page.locator(`${DIALOG} .vilda-centile-live-image`)).toBeVisible();
});

test('zamknięcie podczas odświeżania pełnej grafiki pozostawia SVG także po spóźnionym kadrowaniu', async ({ page }) => {
  const { ids } = await createFictionalVault(page);
  await loadPatient(page, ids.a);
  await ready(page, ids.a);
  await page.locator('.vilda-centile-live-expand').click();
  await expect(page.locator(DIALOG)).toBeVisible();
  await holdPreparation(page);
  await page.evaluate(() => {
    window.chartCreatorData.growth.free.height.push({ id: 9903, ageMonths: 120, value: 141,
      txt: 'E2E po zamknięciu', arrow: true, frame: { ageMonths: 255, value: 220 } });
    document.dispatchEvent(new CustomEvent('vilda:centile-creator-changed'));
  });
  await waitPreparation(page);
  await page.locator(`${DIALOG} .vilda-centile-live-close`).click();
  await expect(page.locator(DIALOG)).toHaveCount(0);
  await expect(page.locator(`${CARD} svg.vilda-centile-live-preview`)).toBeVisible();
  expect(await page.evaluate(() => window.__heldCentilePreparations.some(item => item.cancelled > 0))).toBe(true);
  await page.evaluate(() => { for (const item of window.__heldCentilePreparations) item.release(); });
  await frames(page, 12);
  await expect(page.locator(DIALOG)).toHaveCount(0);
  await expect(page.locator(`${CARD} svg.vilda-centile-live-preview`)).toBeVisible();
  await expect(page.locator(`${CARD} canvas`)).toHaveCount(0);
  expect(await page.evaluate(() => window.VildaCentileLivePanel.getState().fullscreen)).toBe(false);
});

test('blur i natychmiastowe powiększenie pokazują ostatnią zatwierdzoną wartość', async ({ page }) => {
  const { ids } = await createFictionalVault(page);
  await loadPatient(page, ids.a);
  await ready(page, ids.a);
  await page.locator('#height').fill('171');
  // Jedno zadanie przeglądarki: kliknięcie poprzedza debounce i odczyt sejfu.
  await page.evaluate(() => {
    document.getElementById('height').blur();
    document.querySelector('.vilda-centile-live-expand').click();
  });
  await expect(page.locator(DIALOG)).toBeVisible();
  const interaction = page.locator(`${DIALOG} .vilda-centile-live-interaction`).first();
  await interaction.focus();
  await interaction.press('End');
  await expect(page.locator(`${DIALOG} .vilda-centile-live-tooltip-reading`).first()).toContainText('171 cm');
  await page.locator(`${DIALOG} .vilda-centile-live-close`).click();
  await expect(page.locator(DIALOG)).toHaveCount(0);
  await expect(page.locator(`${CARD} .vilda-centile-live-preview-point[data-value="171"]`)).toBeVisible();
});

test('odświeżenie tego samego rekordu podczas kadrowania zachowuje żądanie powiększenia', async ({ page }) => {
  const { ids } = await createFictionalVault(page);
  await loadPatient(page, ids.a);
  await ready(page, ids.a);
  await holdPreparation(page);
  await page.locator('.vilda-centile-live-expand').click();
  await waitPreparation(page);
  await page.evaluate(() => window.VildaCentileLivePanel.refresh());
  await expect(page.locator(DIALOG)).toHaveCount(0);
  await page.evaluate(() => { for (const item of window.__heldCentilePreparations) item.release(); });
  await expect(page.locator(DIALOG)).toBeVisible();
  await expect(page.locator(DIALOG)).toHaveCount(1);
  await expect(page.locator(`${DIALOG} .vilda-centile-live-image`)).toBeVisible();
});
