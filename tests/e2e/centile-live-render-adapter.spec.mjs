import { expect, test } from '@playwright/test';

test.use({ serviceWorkers: 'block' });

async function open(page) {
  await page.goto('/index.html', { waitUntil: 'load' });
  await page.waitForFunction(() => window.buildPalczewskaExtendedCanvases && window.VildaPublicationCreator?.computeSnapshotLayout);
  if (!await page.evaluate(() => Boolean(window.VildaCentileLiveRender))) await page.addScriptTag({ url: '/vilda_centile_live_render.js' });
  await page.evaluate(() => document.fonts.ready);
}

// Entirely fictional growth data. Every reference calculation is performed by
// the actual loaded production generators and clinical APIs.
const fixture = {
  sex: 'M', ageMonths: 158, exactAgeMonths: 158.2, currentHeight: null, currentWeight: null,
  professionalMode: true, source: 'OLAF',
  measurements: [
    { ageMonths: 84, height: 123.6, weight: 23.9 },
    { ageMonths: 96, height: 129.4, weight: 26.8 },
    { ageMonths: 108, height: 135, weight: 29.9 },
    { ageMonths: 120, height: 141, weight: 33 },
    { ageMonths: 132, height: 146.5, weight: 36.5 },
    { ageMonths: 144, height: 152.2, weight: 40 },
    { ageMonths: 152, height: 156, weight: 43 },
  ],
  advanced: { motherHeight: 165, fatherHeight: 180, targetHeight: 179 },
  chartCreatorData: { growth: { version: 1, shared: { a120: { txt: 'Kontrola' } },
    layout: { height: { a120: { frame: { ageMonths: 117, value: 121 } } }, weight: {} },
    free: { height: [{ id: 1, ageMonths: 152, value: 156, txt: 'Notatka', arrow: true,
      frame: { ageMonths: 171, value: 139 } }, { id: 2, br: 1, a1: 96, a2: 144, txt: 'Obserwacja' }], weight: [] } } },
};

test('explicit snapshot draws history/annotations and probe without reading patient globals or changing Creator caches', async ({ page }) => {
  await open(page);
  const result = await page.evaluate(snapshot => {
    const pc = window.VildaPublicationCreator;
    const before = JSON.stringify(snapshot);
    const sentinels = { height: { sentinel: 'height' }, weight: { sentinel: 'weight' } };
    Object.assign(pc._geomStore, sentinels);
    pc._geomByContext.olaf = { height: sentinels.height };
    const contextIdentity = pc._geomByContext.olaf;
    const descriptors = new Map();
    for (const key of ['advancedGrowthData', 'basicGrowthData', 'chartCreatorData']) {
      descriptors.set(key, Object.getOwnPropertyDescriptor(window, key));
      Object.defineProperty(window, key, { configurable: true, get() { throw Error(`Stale patient read: ${key}`); }, set() { throw Error(`Patient mutation: ${key}`); } });
    }
    let output;
    try {
      output = window.VildaCentileLiveRender.render(snapshot);
      const interpolated = output.height.probe(126);
      const expected = window.getCentilePercentileStatsForSource(interpolated.value, 'M', 126, 'HT', 'OLAF');
      return { status: output.status, count: output.height.points.length, annotations: output.height.annotations.length,
        plot: output.height.plot, mph: output.height.mph, interpolated, expected,
        noExtrapolation: output.height.probe(153), unchanged: JSON.stringify(snapshot) === before,
        cacheUnchanged: pc._geomStore.height === sentinels.height && pc._geomStore.weight === sentinels.weight
          && pc._geomByContext.olaf === contextIdentity && contextIdentity.height === sentinels.height,
        dimensions: [output.height.width, output.height.height], bounds: output.height.contentBounds };
    } finally {
      for (const [key, descriptor] of descriptors) {
        if (descriptor) Object.defineProperty(window, key, descriptor); else delete window[key];
      }
    }
  }, fixture);
  expect(result.status).toBe('ready');
  expect(result.count).toBe(7);
  expect(result.annotations).toBe(3);
  expect(result.unchanged).toBe(true);
  expect(result.cacheUnchanged).toBe(true);
  expect(result.interpolated.value).toBeCloseTo(143.75, 8);
  expect(result.interpolated.percentile).toBe(result.expected.percentile);
  expect(result.interpolated.exact).toBe(false);
  expect(result.noExtrapolation).toBeNull();
  expect(result.mph.value).toBe(179);
  expect(result.mph.ageMonths).toBe(216);
  expect(result.bounds.x + result.bounds.width).toBeLessThanOrEqual(result.dimensions[0]);
  expect(result.bounds.y + result.bounds.height).toBeLessThanOrEqual(result.dimensions[1]);
});

test('native infant/WHO/Pal ranges and chart availability are retained', async ({ page }) => {
  await open(page);
  const result = await page.evaluate(snapshot => {
    const renderer = window.VildaCentileLiveRender;
    const infant = { ...snapshot, source: 'PALCZEWSKA', ageMonths: 24, measurements: [{ ageMonths: 6, height: 67, weight: 7.5 }, { ageMonths: 24, height: 88, weight: 12 }] };
    const mixed = renderer.render({ ...snapshot, source: 'PALCZEWSKA', measurements: [...infant.measurements, ...snapshot.measurements] });
    const choice = renderer.render({ ...infant, measurements: [{ ageMonths: 18, height: 82, weight: 10.5 }, { ageMonths: 24, height: 88, weight: 12 }] });
    const who = renderer.render({ ...infant, source: 'WHO' });
    return { mixed: { plan: mixed.rangePlan.mode, ids: mixed.ranges.map(range => range.id), active: mixed.activeRangeId },
      choice: { plan: choice.rangePlan.mode, ids: choice.ranges.map(range => range.id), active: choice.activeRangeId },
      who: { status: who.status, range: [who.height.plot.ageMin, who.height.plot.ageMax] },
      olafInfant: renderer.render({ ...infant, source: 'OLAF' }).status,
      whoOlder: renderer.render({ ...snapshot, source: 'WHO' }).status,
      adult: renderer.render({ ...snapshot, ageMonths: 216 }).status };
  }, fixture);
  expect(result.mixed).toEqual({ plan: 'BOTH_REQUIRED', ids: ['palInfant', 'palRegular'], active: 'palRegular' });
  expect(result.choice).toEqual({ plan: 'CHOICE', ids: ['palInfant', 'palRegular'], active: 'palInfant' });
  expect(result.who).toEqual({ status: 'ready', range: [0, 35] });
  expect(result.olafInfant).toBe('unavailable');
  expect(result.whoOlder).toBe('unavailable');
  expect(result.adult).toBe('unavailable');
});

test('legacy source dx/dy uses original PDF geometry and leaves input store unchanged', async ({ page }) => {
  await open(page);
  const result = await page.evaluate(snapshot => {
    const pc = window.VildaPublicationCreator;
    window.VildaProAccess.hasAccess = () => true;
    document.dispatchEvent(new CustomEvent('vildaProAccessChanged', { detail: { plan: 'pro' } }));
    const mode = document.getElementById('resultsModeToggle');
    mode.checked = true;
    mode.dispatchEvent(new Event('change', { bubbles: true }));
    const legacy = { olaf: { shared: { a120: { txt: 'Kontrola' } }, layout: { height: { a120: { dx: 210, dy: -260 } } }, free: {} } };
    const advanced = { ...snapshot.advanced, currentAgeMonths: snapshot.ageMonths, currentHeight: NaN, currentWeight: NaN, measurements: snapshot.measurements };
    window.advancedGrowthData = advanced;
    window.chartCreatorData = JSON.parse(JSON.stringify(legacy));
    window.buildCentilePageCanvas({ rangeMinX: 36, rangeMaxX: 216, sex: 'M', userAgeMonths: 158, userWeight: NaN, userHeight: NaN, chartSource: 'OLAF' });
    const geom = { ...pc._geomStore.height };
    const ctx = document.createElement('canvas').getContext('2d');
    const oldAdv = Object.assign(Object.create(advanced), { __ctxRegular: true, pubShared: legacy.olaf.shared, pubLayout: legacy.olaf.layout, pubFree: legacy.olaf.free });
    const old = pc._computeLayout(ctx, oldAdv, 'height', geom)[0];
    const age = 36 + (old.x + old.w / 2 - geom.plotX) * 180 / geom.plotW;
    const value = geom.minY + (geom.plotY + geom.plotH - old.y - old.h / 2) * (geom.maxY - geom.minY) / geom.plotH;
    const before = JSON.stringify(legacy);
    const output = window.VildaCentileLiveRender.render({ ...snapshot, source: 'PALCZEWSKA', chartCreatorData: legacy });
    const annotation = output.height.annotations[0]; const plot = output.height.plot;
    return { unchanged: JSON.stringify(legacy) === before, age, value,
      actualAge: plot.ageMin + (annotation.x + annotation.w / 2 - plot.x) * (plot.ageMax - plot.ageMin) / plot.w,
      actualValue: plot.minY + (plot.y + plot.h - annotation.y - annotation.h / 2) * (plot.maxY - plot.minY) / plot.h };
  }, fixture);
  expect(result.unchanged).toBe(true);
  expect(result.actualAge).toBeCloseTo(result.age, 7);
  expect(result.actualValue).toBeCloseTo(result.value, 7);
});

test('MPH uses current explicit parents, matches the legacy API and clears when either parent is absent', async ({ page }) => {
  await open(page);
  const result = await page.evaluate(snapshot => {
    const mother = document.getElementById('advMotherHeight');
    const father = document.getElementById('advFatherHeight');
    mother.value = '165'; father.value = '180';
    const legacy = window.advGrowthBuildTargetHeightForReport('M');
    const explicit = window.VildaAdvancedGrowth.advGrowthBuildTargetHeightForReport('M', { motherHeight: 165, fatherHeight: 180 });
    const stale = window.VildaCentileLiveRender.render({ ...snapshot, advanced: { motherHeight: 165, fatherHeight: 180, targetHeight: 190 } });
    const missing = window.VildaCentileLiveRender.render({ ...snapshot, advanced: { motherHeight: 165, fatherHeight: null, targetHeight: 190 } });
    return { legacy, explicit, stale: stale.height.mph?.value, missing: missing.height.mph,
      noMother: window.VildaAdvancedGrowth.advGrowthBuildTargetHeightForReport('M', { motherHeight: null, fatherHeight: 180 }),
      noFather: window.VildaAdvancedGrowth.advGrowthBuildTargetHeightForReport('M', { motherHeight: 165, fatherHeight: null }) };
  }, fixture);
  expect(result.legacy).toBe(179);
  expect(result.explicit).toBe(result.legacy);
  expect(result.stale).toBe(179);
  expect(result.missing).toBeNull();
  expect(result.noMother).toBeNull();
  expect(result.noFather).toBeNull();
});

test('readout population and source remain attached to the rendered snapshot', async ({ page }) => {
  await open(page);
  const result = await page.evaluate(snapshot => {
    const original = window.VildaPopulacjaPacjenta;
    const renderer = window.VildaCentileLiveRender;
    try {
      window.VildaPopulacjaPacjenta = () => 'OGOLNA';
      const legacy = window.getCentilePercentileStatsForSource(141, 'M', 120, 'HT', 'OLAF');
      const explicit = window.getCentilePercentileStatsForSource(141, 'M', 120, 'HT', 'OLAF', { population: 'OGOLNA' });
      const general = renderer.render({ ...snapshot, population: 'OGOLNA' });
      const before = general.height.probe(126);
      window.VildaPopulacjaPacjenta = () => 'DS';
      const after = general.height.probe(126);
      const ds = renderer.render({ ...snapshot, population: 'DS' });
      const dsBefore = ds.height.probe(126);
      window.VildaPopulacjaPacjenta = () => 'OGOLNA';
      const dsAfter = ds.height.probe(126);
      return { legacy, explicit, before, after, dsBefore, dsAfter };
    } finally { window.VildaPopulacjaPacjenta = original; }
  }, fixture);
  expect(result.explicit).toEqual(result.legacy);
  expect(result.after).toEqual(result.before);
  expect(result.before.source).toBe('OLAF');
  expect(result.dsBefore.source).toBe('DS');
  expect(result.dsAfter).toEqual(result.dsBefore);
});

test('explicit legacy geometries match genuine standard and professional PDF pages, including the name-dependent header', async ({ page }) => {
  await open(page);
  const results = await page.evaluate(snapshot => {
    window.VildaProAccess.hasAccess = () => true;
    document.dispatchEvent(new CustomEvent('vildaProAccessChanged', { detail: { plan: 'pro' } }));
    const advanced = { ...snapshot.advanced, currentAgeMonths: snapshot.ageMonths, currentHeight: NaN, currentWeight: NaN, measurements: snapshot.measurements };
    window.advancedGrowthData = advanced;
    const outputs = [];
    for (const scenario of [{ pro: true, name: '', force: false }, { pro: false, name: '', force: false },
      { pro: false, name: 'Fikcyjny Testowy', force: false }, { pro: true, name: 'Fikcyjny Testowy', force: true }]) {
      const mode = document.getElementById('resultsModeToggle'); mode.checked = scenario.pro; mode.dispatchEvent(new Event('change', { bubbles: true }));
      document.getElementById('name').value = scenario.name;
      window.forceStandardCentileChartStyle = scenario.force;
      const args = { rangeMinX: 36, rangeMaxX: 216, sex: 'M', userAgeMonths: 158, userWeight: NaN, userHeight: NaN, chartSource: 'OLAF' };
      window.buildCentilePageCanvas(args);
      const actual = JSON.parse(JSON.stringify(window.VildaPublicationCreator._geomStore));
      const model = window.buildCentilePageCanvas({ ...args, growthData: advanced, modelOnly: true,
        legacyLayout: { standard: scenario.force || !window.isCentileChartProfessionalMode(), hasName: !!window.getCentileChartHeaderNameState().name, hasSubtitle: true } });
      outputs.push({ scenario, actual, expected: model.originalGeometries });
    }
    return outputs;
  }, fixture);
  for (const row of results) for (const metric of ['height', 'weight']) for (const key of ['plotX', 'plotY', 'plotW', 'plotH', 'minY', 'maxY']) {
    expect(row.expected[metric][key], `${JSON.stringify(row.scenario)} ${metric}.${key}`).toBeCloseTo(row.actual[metric][key], 8);
  }
});

test('default PDF canvas pixels remain unchanged before and after rendering a different patient snapshot', async ({ page }) => {
  await open(page);
  const result = await page.evaluate(snapshot => {
    const outputs = [];
    function defaults() {
      const canvases = ['OLAF', 'WHO', 'PALCZEWSKA'].map(source => window.buildCentilePageCanvas({
        rangeMinX: source === 'OLAF' ? 36 : 0, rangeMaxX: source === 'OLAF' ? 216 : source === 'WHO' ? 35 : 36,
        sex: 'M', userAgeMonths: 72, userHeight: 117.2, userWeight: 21, chartSource: source,
        headerTitle: 'Dane fikcyjne', headerSubtitle: 'Siatka testowa', footerText: 'test',
      }));
      canvases.push(...window.buildPalczewskaExtendedCanvases({ sex: 'M', userAgeMonths: 72, userHeight: 117.2, userWeight: 21 }));
      return canvases.map(canvas => canvas.toDataURL('image/png'));
    }
    window.VildaProAccess.hasAccess = () => true;
    document.dispatchEvent(new CustomEvent('vildaProAccessChanged', { detail: { plan: 'pro' } }));
    for (const professional of [false, true]) {
      const mode = document.getElementById('resultsModeToggle'); mode.checked = professional; mode.dispatchEvent(new Event('change', { bubbles: true }));
      const foreign = { currentAgeMonths: 72, currentHeight: 117.2, currentWeight: 21, measurements: [{ ageMonths: 60, height: 110.8, weight: 18.6 }] };
      const store = { olaf: {}, palRegular: {} };
      window.advancedGrowthData = foreign; window.chartCreatorData = store;
      const before = defaults();
      window.VildaCentileLiveRender.render(snapshot);
      const unchangedIdentity = window.advancedGrowthData === foreign && window.chartCreatorData === store;
      const after = defaults();
      outputs.push({ professional, unchangedIdentity, pixels: before.map((png, i) => png === after[i]) });
    }
    return outputs;
  }, fixture);
  for (const mode of result) {
    expect(mode.unchangedIdentity).toBe(true);
    expect(mode.pixels).toEqual([true, true, true, true, true]);
  }
});

test('light preview keeps full chart domains, clinical points and probes without canvas or Creator work', async ({ page }) => {
  test.setTimeout(120_000);
  await open(page);
  const results = await page.evaluate(snapshot => {
    const api = window.VildaCentileLiveRender;
    const child = { ...snapshot, ageMonths: 24, exactAgeMonths: 24.3,
      currentHeight: 88, currentWeight: 12,
      measurements: [{ ageMonths: 6, height: 67, weight: 7.5 }, { ageMonths: 18, height: 82, weight: 10.5 }] };
    const cases = [
      { ...snapshot, source: 'OLAF', currentHeight: 159, currentWeight: 47 },
      { ...snapshot, source: 'PALCZEWSKA', measurements: [...child.measurements, ...snapshot.measurements] },
      { ...child, source: 'WHO', professionalMode: false },
      { ...child, source: 'PALCZEWSKA' },
      { ...snapshot, source: 'OLAF', sex: 'F' },
      { ...snapshot, source: 'OLAF', population: 'DS' },
    ];
    function clinical(point) {
      if (!point) return point;
      const { x, y, ...data } = point;
      return data;
    }
    function domain(asset) {
      const { ageMin, ageMax, minY, maxY } = asset.plot;
      return { ageMin, ageMax, minY, maxY };
    }
    return cases.map(input => {
      const before = JSON.stringify(input);
      const createElement = document.createElement;
      const layout = window.VildaPublicationCreator.computeSnapshotLayout;
      const getImageData = CanvasRenderingContext2D.prototype.getImageData;
      let preview;
      try {
        document.createElement = function (name, ...args) {
          if (String(name).toLowerCase() === 'canvas') throw new Error('Preview allocated a canvas');
          return createElement.call(this, name, ...args);
        };
        window.VildaPublicationCreator.computeSnapshotLayout = () => { throw new Error('Preview prepared Creator annotations'); };
        CanvasRenderingContext2D.prototype.getImageData = () => { throw new Error('Preview read canvas pixels'); };
        preview = api.preview(input);
      } finally {
        document.createElement = createElement;
        window.VildaPublicationCreator.computeSnapshotLayout = layout;
        CanvasRenderingContext2D.prototype.getImageData = getImageData;
      }
      const full = api.render(input, { deferContentBounds: true });
      const assets = preview.ranges.flatMap((range, index) => ['height', 'weight'].map(metric => {
        const light = range[metric], original = full.ranges[index][metric];
        const ages = light.points.map(point => point.ageMonths);
        if (ages.length > 1) ages.push((ages[0] + ages[1]) / 2);
        ages.push(light.plot.ageMin - 1, light.plot.ageMax + 1);
        return {
          range: range.id, metric, preview: light.preview, noCanvas: !light.canvas,
          curves: Object.keys(light.curves), domain: domain(light), fullDomain: domain(original),
          points: light.points.map(clinical), fullPoints: original.points.map(clinical),
          probes: ages.map(age => clinical(light.probe(age))), fullProbes: ages.map(age => clinical(original.probe(age))),
        };
      }));
      return { source: input.source, population: input.population || 'OGOLNA', sex: input.sex,
        status: preview.status, fullStatus: full.status,
        plan: preview.rangePlan, fullPlan: full.rangePlan,
        ids: preview.ranges.map(range => range.id), fullIds: full.ranges.map(range => range.id),
        active: preview.activeRangeId, fullActive: full.activeRangeId,
        unchanged: JSON.stringify(input) === before, assets };
    });
  }, fixture);
  expect(results).toHaveLength(6);
  for (const row of results) {
    expect(row.status).toBe('ready');
    expect(row.status).toBe(row.fullStatus);
    expect(row.plan).toEqual(row.fullPlan);
    expect(row.ids).toEqual(row.fullIds);
    expect(row.active).toBe(row.fullActive);
    expect(row.unchanged).toBe(true);
    for (const asset of row.assets) {
      expect(asset.preview).toBe(true);
      expect(asset.noCanvas).toBe(true);
      expect(asset.curves).toEqual(['3', '50', '97']);
      expect(asset.domain, `${row.source}/${row.population}/${row.sex}/${asset.range}/${asset.metric}: pełny zakres bez autozoomu`).toEqual(asset.fullDomain);
      expect(asset.points).toEqual(asset.fullPoints);
      expect(asset.probes).toEqual(asset.fullProbes);
    }
  }
});
