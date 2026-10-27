import { expect, test } from '../support/test-czas.mjs';
import { createFictionalVault, fictionalPatient, loadPatient, readyForPatient, shellFrame } from '../support/centile-live-fixture.mjs';

test.use({ serviceWorkers: 'block', reducedMotion: 'reduce' });
test.setTimeout(150_000);
const PREVIEW = 'svg.vilda-centile-live-preview';
const DIALOG = '.vilda-centile-live-dialog';
const NOTE = 'E2E-LIVE-ZEMEL';

function dsPatient({ sex = 'M', source = 'OLAF', infant = false, ds = true } = {}) {
  const record = fictionalPatient({ firstName: infant ? 'ZemelNiemowle' : 'ZemelTest', sex,
    age: infant ? 2 : 12, height: infant ? 80 : 140, weight: infant ? 10 : 40, note: NOTE });
  // Explicit age fields make native clinical and drawing ages deterministic.
  delete record.user.dobISO;
  record.zscore.dataSource = source;
  if (ds) record.clinical = { downSyndrome: true };
  record.advanced.data.measurements = infant ? [
    { ageMonths: 6, height: 60, weight: 6 }, { ageMonths: 12, height: 68, weight: 7.5 },
    { ageMonths: 18, height: 75, weight: 9 },
  ] : [
    { ageMonths: 84, height: 110, weight: 20 }, { ageMonths: 108, height: 123, weight: 27 },
    { ageMonths: 132, height: 133, weight: 33 },
  ];
  const anchor = record.advanced.data.measurements[1];
  record.chartCreator.growth.free.height = [{ id: 901, ageMonths: anchor.ageMonths, value: anchor.height, txt: NOTE, arrow: true }];
  record.chartCreator.growth.free.weight = [{ id: 902, ageMonths: anchor.ageMonths, value: anchor.weight, txt: `${NOTE}-W`, arrow: false }];
  return record;
}

async function open(page, { route = 'index', shell = false } = {}) {
  const created = await createFictionalVault(page, { shell });
  let frame = created.frame;
  if (route === 'docpro') {
    if (shell) {
      await page.evaluate(() => window.VildaShell.navigate('docpro'));
      frame = await shellFrame(page, 'DocPro');
    } else {
      await page.goto('/docpro.html', { waitUntil: 'load' });
      frame = page;
    }
    await readyForPatient(frame);
    const confirmation = frame.locator('#professionalConfirmBtn');
    if (await confirmation.isVisible()) await confirmation.click();
  }
  await frame.waitForFunction(() => window.VildaCentileLiveRender && window.VildaCentileLiveData
    && window.VildaSummaryTabs && window.VildaDsCentileModels);
  await frame.evaluate(() => {
    const renderer = window.VildaCentileLiveRender;
    const preview = renderer.preview, render = renderer.render;
    window.__zemelFullRenders = 0;
    renderer.preview = function (...args) { const result = preview.apply(this, args); window.__zemelPreview = result; return result; };
    renderer.render = function (...args) {
      try { const result = render.apply(this, args); window.__zemelFull = result; window.__zemelFullRenders++; return result; }
      catch (error) { window.__zemelRenderError = error.stack || String(error); throw error; }
    };
  });
  return { ...created, frame };
}

test.afterEach(async ({ page }, info) => {
  if (info.status === info.expectedStatus) return;
  for (const frame of page.frames()) {
    const state = await frame.evaluate(async () => ({
      route: location.pathname, panel: window.VildaCentileLivePanel?.getState(),
      tabs: window.VildaSummaryTabs?.getState(), population: typeof window.VildaPopulacjaPacjenta === 'function' ? window.VildaPopulacjaPacjenta() : 'missing',
      dsSource: window.VildaDsSource?.getState?.(),
      dedicated: window.VildaCentileLiveData?.getEligibility(), summary: window.VildaCentileLiveData?.getEligibility({ mode: 'summary' }),
      renderError: window.__zemelRenderError, fullRenders: window.__zemelFullRenders,
      source: document.querySelector('input[name="dataSource"]:checked')?.value,
      values: ['age', 'ageMonths', 'height', 'weight'].map(id => [id, document.getElementById(id)?.value]),
    })).catch(() => null);
    await info.attach('zemel-state.json', { body: JSON.stringify(state, null, 2), contentType: 'application/json' });
  }
});

async function save(frame, record, choice = 'restore') {
  const id = await frame.evaluate(async record => (await window.VildaVault.savePatient(record, { dedup: false })).patientId, record);
  await loadPatient(frame, id, choice);
  return id;
}

async function showChart(frame, source = 'DS', { dedicated = false } = {}) {
  const tab = frame.getByRole('tab', { name: 'Siatka centylowa', exact: true });
  if (!dedicated) {
    await expect(tab).toBeVisible({ timeout: 30_000 });
    await tab.click();
  }
  await expect(frame.locator(PREVIEW)).toBeVisible({ timeout: 30_000 });
  await expect(frame.locator(PREVIEW)).toHaveAttribute('data-source', source);
  await expect.poll(() => frame.evaluate(() => window.VildaCentileLivePanel.getState().source)).toBe(source);
}

async function nativeAgreement(frame, { dedicated = false } = {}) {
  return frame.evaluate(async dedicated => {
    const snapshot = await window.VildaCentileLiveData.getSnapshot(dedicated ? undefined : { mode: 'summary' });
    const native = window.VildaDsCentileModels.build({ sex: snapshot.sex, userAgeMonths: snapshot.ageMonths,
      userHeight: snapshot.currentHeight, userWeight: snapshot.currentWeight,
      growthData: { ...snapshot.advanced, measurements: snapshot.measurements,
        currentAgeMonths: snapshot.ageMonths, currentHeight: snapshot.currentHeight, currentWeight: snapshot.currentWeight } });
    const drawn = window.__zemelPreview;
    return { source: snapshot.source, population: snapshot.population, requested: snapshot.requestedSource,
      rows: ['height', 'weight'].map(metric => {
        const model = drawn[metric], nativeModel = native[metric];
        const point = model.points.find(point => point.current) || model.points.at(-1);
        const stats = window.getCentilePercentileStatsForSource(point.value, snapshot.sex,
          point.clinicalAgeMonths, metric === 'height' ? 'HT' : 'WT', 'DS', { population: 'DS' });
        const general = window.getCentilePercentileStatsForSource(point.value, snapshot.sex,
          point.clinicalAgeMonths, metric === 'height' ? 'HT' : 'WT', snapshot.requestedSource, { population: 'OGOLNA' });
        return { metric, source: model.source, point, stats, general,
          nativeBounds: [nativeModel.minX, nativeModel.maxX], bounds: [model.plot.ageMin, model.plot.ageMax],
          curvesAgree: [3, 50, 97].every(centile => JSON.stringify(model.curves[centile]) === JSON.stringify(nativeModel.curves[centile])) };
      }) };
  }, dedicated);
}

for (const [route, sex, source] of [['index', 'M', 'OLAF'], ['docpro', 'F', 'PALCZEWSKA']]) {
  test(`${route}: DS ma natywne krzywe Zemel, punkty i dymek w SVG oraz obu powiększonych siatkach (${sex})`, async ({ page }) => {
    const { frame } = await open(page, { route });
    await save(frame, dsPatient({ sex, source }));
    await showChart(frame);
    await expect(frame.locator('.vilda-centile-live-source').first()).toContainText('Zemel 2015');
    await expect(frame.locator(`${PREVIEW} .vilda-centile-live-preview-centile`)).toHaveCount(3);
    expect(await frame.evaluate(() => window.__zemelFullRenders)).toBe(0);
    const agreement = await nativeAgreement(frame);
    expect(agreement).toMatchObject({ source: 'DS', population: 'DS', requested: source });
    for (const row of agreement.rows) {
      expect(row.curvesAgree, `${row.metric}: same sampled curves as the production Zemel PDF producer`).toBe(true);
      expect(row.bounds).toEqual(row.nativeBounds);
      expect(row.bounds).toEqual([0, 240]);
      expect(row.source).toBe('DS');
      expect(row.point.source).toBe('DS');
      expect(row.point.percentile).toBeCloseTo(row.stats.percentile, 10);
      expect(row.point.sd).toBeCloseTo(row.stats.sd, 10);
      expect(Math.abs(row.point.percentile - row.general.percentile), 'the clinical source really differs from the general population').toBeGreaterThan(1);
    }
    await page.screenshot({ path: test.info().outputPath(`${route}-zemel-preview.png`) });
    const creator = await frame.evaluate(() => JSON.stringify(window.chartCreatorData));
    await frame.locator('.vilda-centile-live-expand').click();
    const dialog = page.locator(DIALOG);
    await expect(dialog).toBeVisible({ timeout: 30_000 });
    await expect(dialog.locator('.vilda-centile-live-source')).toContainText('Zemel 2015');
    await expect(dialog.locator('svg.vilda-centile-live-full-svg[data-source="DS"][data-metric="height"]')).toBeVisible();
    await expect(dialog.locator('.vilda-centile-live-mph:visible')).toHaveCount(0);
    await expect(dialog.locator('.vilda-centile-live-parents')).toContainText('Mama:');
    await expect(dialog.locator('.vilda-centile-live-parents')).toContainText('Tata:');
    const full = await frame.evaluate(() => ({ mph: window.__zemelFull.height.mph,
      annotations: ['height', 'weight'].map(metric => window.__zemelFull[metric].annotations.map(item => item.comment)) }));
    expect(full.mph).toBeNull();
    expect(full.annotations.flat().some(note => note.includes(NOTE))).toBe(true);
    await dialog.locator('.vilda-centile-live-interaction').first().focus();
    await page.keyboard.press('End');
    await expect(dialog.locator('.vilda-centile-live-probe-dot').first()).toHaveAttribute('data-source', 'DS');
    await expect.poll(() => frame.evaluate(() => window.VildaCentileLivePanel.getState().probes?.height?.percentile))
      .toBeCloseTo(agreement.rows[0].point.percentile, 10);
    await dialog.locator('[data-centile-live-metric="both"]').click();
    await expect(dialog.locator('svg.vilda-centile-live-full-svg[data-source="DS"]:visible')).toHaveCount(2);
    await expect(dialog.locator('.vilda-centile-live-mph:visible')).toHaveCount(0);
    await page.screenshot({ path: test.info().outputPath(`${route}-zemel-both.png`) });
    await dialog.locator('.vilda-centile-live-close').click();
    await expect(dialog).toHaveCount(0);
    expect(await frame.evaluate(() => JSON.stringify(window.chartCreatorData))).toBe(creator);
    await frame.locator('[data-centile-live-metric="weight"]').click();
    await expect(frame.locator(PREVIEW)).toHaveAttribute('data-metric', 'weight');
    await expect(frame.locator(PREVIEW)).toHaveAttribute('data-source', 'DS');
  });
}

test('niemowlę DS: Nowy pomiar rysuje Zemel zgodnie z wiekiem poniżej 3 lat', async ({ page }) => {
  const { frame } = await open(page);
  await save(frame, dsPatient({ infant: true, source: 'PALCZEWSKA' }), 'new');
  await frame.locator('#age').fill('1');
  await frame.locator('#ageMonths').fill('8');
  await frame.locator('#height').fill('80');
  await frame.locator('#weight').fill('10');
  await frame.locator('#weight').blur();
  await showChart(frame, 'DS', { dedicated: true });
  const agreement = await nativeAgreement(frame, { dedicated: true });
  expect(agreement).toMatchObject({ source: 'DS', population: 'DS', requested: 'PALCZEWSKA' });
  for (const row of agreement.rows) {
    expect(row.curvesAgree).toBe(true);
    expect(row.bounds).toEqual(row.nativeBounds);
    expect(row.point.percentile).toBeCloseTo(row.stats.percentile, 10);
  }
  await frame.locator('.vilda-centile-live-expand').click();
  await expect(page.locator(DIALOG)).toBeVisible({ timeout: 30_000 });
  await expect(page.locator(`${DIALOG} .vilda-centile-live-source`)).toContainText('Zemel 2015');
  await expect(page.locator(`${DIALOG} .vilda-centile-live-mph:visible`)).toHaveCount(0);
});

test('rzeczywisty checkbox w Karcie pacjenta przełącza siatkę w obie strony i zachowuje wybór Palczewskiej', async ({ page }) => {
  const { frame } = await open(page);
  const id = await save(frame, dsPatient({ source: 'PALCZEWSKA', ds: false }));
  await showChart(frame, 'PALCZEWSKA');
  await frame.evaluate(async () => { window.__zemelOldSnapshot = await window.VildaCentileLiveData.getSnapshot({ mode: 'summary' }); });
  for (const enabled of [true, false]) {
    await frame.evaluate(id => window.VildaAuthUI.showPatientEditScreen(id), id);
    const checkbox = frame.locator('#vePatientDownSyndrome');
    await expect(checkbox).toBeVisible();
    await checkbox.setChecked(enabled);
    await frame.getByRole('button', { name: 'Zapisz zmiany', exact: true }).click();
    await expect.poll(() => frame.evaluate(() => window.VildaCentileLivePanel.getState().source), { timeout: 30_000 })
      .toBe(enabled ? 'DS' : 'PALCZEWSKA');
    await expect(frame.locator(PREVIEW)).toHaveAttribute('data-source', enabled ? 'DS' : 'PALCZEWSKA');
    expect(await frame.locator('#sourcePalczewska').isChecked()).toBe(true);
    expect(await frame.evaluate(() => window.VildaCentileLiveData.isCurrent(window.__zemelOldSnapshot))).toBe(false);
    expect(await frame.evaluate(async id => !!(await window.VildaVault.getPatient(id)).snapshots[0].payload.clinical?.downSyndrome, id)).toBe(enabled);
  }
});

test('powłoka: zmiana pacjenta DS na populację ogólną usuwa Zemel i przywraca zwykłe MPH', async ({ page }) => {
  const { frame } = await open(page, { shell: true });
  await save(frame, dsPatient());
  await showChart(frame);
  await frame.locator('.vilda-centile-live-expand').click();
  await expect(page.locator(`${DIALOG} .vilda-centile-live-source`)).toContainText('Zemel 2015');
  await expect(frame.locator(DIALOG)).toHaveCount(0);
  await expect(page.locator(`${DIALOG} .vilda-centile-live-mph:visible`)).toHaveCount(0);
  await page.locator(`${DIALOG} .vilda-centile-live-close`).click();
  await save(frame, dsPatient({ ds: false }));
  await showChart(frame, 'OLAF');
  await frame.locator('.vilda-centile-live-expand').click();
  await expect(page.locator(`${DIALOG} .vilda-centile-live-source`)).toContainText('OLAF');
  await expect(page.locator(`${DIALOG} svg.vilda-centile-live-full-svg[data-source="DS"]`)).toHaveCount(0);
  await expect(page.locator(`${DIALOG} .vilda-centile-live-mph:visible`)).toHaveCount(1);
});
