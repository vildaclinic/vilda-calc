import { expect, test } from '../support/test-czas.mjs';
import { writeFile } from 'node:fs/promises';
import { createFictionalVault, fictionalPatient, loadPatient, readyForPatient, shellFrame } from '../support/centile-live-fixture.mjs';

// Real form, summary, reference models and chart controller. All records belong
// to a new synthetic vault in this test's disposable browser profile.
test.use({ serviceWorkers: 'block', reducedMotion: 'reduce' });
test.setTimeout(120_000);

const CARD = '#currentSummaryCard';
const PREVIEW = '#vildaSummaryChartPanel svg.vilda-centile-live-preview';
const DIALOG = '.vilda-centile-live-dialog';
const SUMMARY_KEYS = ['weight', 'height', 'bmi', 'cole', 'velocity', 'velocity-sds', 'mph', 'delta', 'prediction', 'bsa'];

function patient({ height = 155, weight = 44, history = [], source = 'PALCZEWSKA', note = 'E2E-LIVE-SUMMARY' } = {}) {
  const record = fictionalPatient({ firstName: 'Anna', sex: 'F', age: 12, height, weight, note });
  record.zscore.dataSource = source;
  record.advanced.fatherHeight = 182;
  Object.assign(record.advanced.data, { fatherHeight: 182, measurements: history });
  return record;
}

async function open(page, route = 'index') {
  await page.addInitScript(() => {
    window.__summaryCopies = [];
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText(text) { window.__summaryCopies.push(text); return Promise.resolve(); } },
    });
  });
  await createFictionalVault(page);
  if (route === 'docpro') {
    await page.goto('/docpro.html', { waitUntil: 'load' });
    await readyForPatient(page);
    const confirmation = page.locator('#professionalConfirmBtn');
    if (await confirmation.isVisible()) await confirmation.click();
  }
  await page.waitForFunction(() => window.VildaProfessionalSummary && window.VildaSummaryTabs
    && window.VildaCentileLiveRender && window.VildaCentileLiveData);
  await page.evaluate(() => {
    window.__summaryFullRenders = 0;
    window.__summaryEvents = [];
    window.VildaCentileLiveData.subscribe(event => {
      window.__summaryEvents.push({ ...event, id: sessionStorage.getItem('vildaCurrentPatientId'),
        owner: window.VildaPanelPacjent?.wlasciciel?.(), stale: window.VildaPanelPacjent?.nieaktualny?.(),
        clearUntil: window.__vildaPersistClearUntil, restoring: window.__vildaPersistRestoring,
        sequence: window.VildaDataImportExport.getApplyLoadedDataSequence() });
      if (window.__summaryEvents.length > 100) window.__summaryEvents.shift();
    });
    const render = window.VildaCentileLiveRender.render;
    window.VildaCentileLiveRender.render = function (...args) {
      window.__summaryFullRenders++;
      return render.apply(this, args);
    };
  });
}

test.afterEach(async ({ page }, info) => {
  if (info.status === info.expectedStatus || page.isClosed()) return;
  const state = await page.evaluate(() => ({
    summary: window.VildaCentileLiveData?.getEligibility({ mode: 'summary' }),
    dedicated: window.VildaCentileLiveData?.getEligibility(),
    id: sessionStorage.getItem('vildaCurrentPatientId'),
    owner: window.VildaPanelPacjent?.wlasciciel?.(), stale: window.VildaPanelPacjent?.nieaktualny?.(),
    clearUntil: window.__vildaPersistClearUntil, now: Date.now(), restoring: window.__vildaPersistRestoring,
    sequence: window.VildaDataImportExport?.getApplyLoadedDataSequence(),
    panel: window.VildaCentileLivePanel?.getState(), tabs: window.VildaSummaryTabs?.getState(),
    events: window.__summaryEvents,
  }));
  const path = info.outputPath('summary-state.json');
  await writeFile(path, JSON.stringify(state, null, 2));
  await info.attach('summary-state.json', { path, contentType: 'application/json' });
});

async function chooseSource(page, source) {
  await page.evaluate(source => {
    const input = document.getElementById(source === 'OLAF' ? 'sourceOlaf' : 'sourcePalczewska');
    input.checked = true;
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }, source);
}

async function fillDraft(page, { height = 155, weight = 44 } = {}) {
  await page.locator('#sex').selectOption('F');
  await page.locator('#age').fill('12');
  await page.locator('#ageMonths').fill('0');
  await page.locator('#height').fill(String(height));
  await page.locator('#weight').fill(String(weight));
  await page.locator('#weight').blur();
  await chooseSource(page, 'PALCZEWSKA');
  await expect(page.locator(CARD)).toBeVisible();
  await expect(page.getByRole('tab', { name: 'Podsumowanie', exact: true })).toHaveAttribute('aria-selected', 'true');
}

async function saved(page, record) {
  const id = await page.evaluate(async payload => (await window.VildaVault.savePatient(payload, { dedup: false })).patientId, record);
  await loadPatient(page, id, 'restore');
  await expect(page.locator(CARD)).toBeVisible();
  return id;
}

async function chart(page) {
  await page.getByRole('tab', { name: 'Siatka centylowa', exact: true }).click();
  await expect(page.locator(PREVIEW)).toBeVisible({ timeout: 30_000 });
  await expect.poll(() => page.evaluate(() => window.VildaCentileLivePanel.getState().status)).toBe('ready');
}

async function copySummary(page) {
  const count = await page.evaluate(() => window.__summaryCopies.length);
  await page.locator('#metabolicSummaryBtn').click();
  await expect.poll(() => page.evaluate(() => window.__summaryCopies.length)).toBe(count + 1);
  return page.evaluate(() => window.__summaryCopies.at(-1));
}

async function capture(page, name) {
  const path = test.info().outputPath(`${name}.png`);
  await page.locator(CARD).screenshot({ path });
  await test.info().attach(name, { path, contentType: 'image/png' });
}

for (const route of ['index', 'docpro']) {
  test(`${route}: nowy niezapisany pacjent ma pojedynczy punkt, a pierwsze kliknięcie zakładki zatwierdza pole`, async ({ page }) => {
    await open(page, route);
    await fillDraft(page);
    if (route === 'index') await capture(page, 'desktop-summary-normal');
    await expect(page.locator(PREVIEW)).toHaveCount(0);
    expect(await page.evaluate(() => window.__summaryFullRenders)).toBe(0);
    expect(await page.evaluate(() => sessionStorage.getItem('vildaCurrentPatientId'))).toBeNull();

    // The tab must survive the calculation triggered by mousedown -> blur.
    await page.locator('#height').fill('156');
    await chart(page);
    await expect(page.locator(`${PREVIEW} .vilda-centile-live-preview-point`)).toHaveCount(1);
    await expect(page.locator(`${PREVIEW} .vilda-centile-live-preview-point`)).toHaveAttribute('data-value', '156');
    const snapshot = await page.evaluate(() => window.VildaCentileLiveData.getSnapshot({ mode: 'summary' }));
    expect(snapshot.patientId).toBeNull();
    expect(snapshot.currentHeight).toBe(156);
    expect(snapshot.measurements).toHaveLength(0);
    expect(await page.evaluate(() => window.__summaryFullRenders)).toBe(0);
    await expect(page.locator('#vildaCentileLiveMount')).toHaveCount(1);
    await expect(page.locator('#vildaSummaryChartPanel #vildaCentileLiveMount')).toBeVisible();
    if (route === 'index') await capture(page, 'desktop-chart-single');

    await page.getByRole('tab', { name: 'Podsumowanie', exact: true }).click();
    await expect(page.locator(`${CARD} [data-summary-key="velocity"]`)).toContainText(/Brak|brak|wcześniejszego|poprzedniego/);
    // Chart updates keep the last committed value while the next field is edited.
    await chart(page);
    await page.locator('#height').fill('1');
    await page.evaluate(() => window.VildaCentileLivePanel.refresh());
    await expect(page.locator(`${PREVIEW} .vilda-centile-live-preview-point`)).toHaveAttribute('data-value', '156');
    await page.locator('#height').fill('157');
    await page.locator('#height').press('Enter');
    await expect(page.locator(`${PREVIEW} .vilda-centile-live-preview-point`)).toHaveAttribute('data-value', '157');
    expect(await page.evaluate(() => window.__summaryFullRenders)).toBe(0);
  });
}

test('Podsumowanie: stała kolejność, białe prawidłowe wyniki, wyrównanie i niezmieniony schowek po zmianie zakładki', async ({ page }) => {
  await open(page);
  await saved(page, patient({ height: 139, weight: 32 }));
  const main = page.locator(`${CARD} .professional-summary-main`);
  await expect(main.locator('[data-summary-key]')).toHaveCount(10);
  expect(await main.locator('[data-summary-key]').evaluateAll(rows => rows.map(row => row.dataset.summaryKey))).toEqual(SUMMARY_KEYS);
  await expect(main.locator('[data-summary-key="height"]')).toHaveAttribute('data-tone', 'danger');
  await expect(main.locator('[data-summary-key="weight"]')).toHaveAttribute('data-tone', 'warn');
  for (const key of ['bmi', 'cole']) {
    const row = main.locator(`[data-summary-key="${key}"]`);
    await expect(row).toHaveAttribute('data-assessment', 'normal');
    expect(await row.evaluate(el => getComputedStyle(el).color)).toBe('rgb(8, 124, 128)');
    expect(await row.evaluate(el => getComputedStyle(el).backgroundColor)).toBe('rgb(255, 255, 255)');
  }
  for (const key of ['velocity-sds', 'bsa', 'prediction']) {
    await expect(main.locator(`[data-summary-key="${key}"]`)).toHaveAttribute('data-assessment', 'unassessed');
  }
  expect(await main.locator('[data-summary-key]').evaluateAll(rows => {
    const left = rows[0].getBoundingClientRect().left, right = rows[0].getBoundingClientRect().right;
    return rows.every(row => Math.abs(row.getBoundingClientRect().left - left) < 1 && Math.abs(row.getBoundingClientRect().right - right) < 1);
  })).toBe(true);
  await expect(main).not.toContainText('!');
  await expect(main.locator('[data-summary-key="velocity-sds"]')).not.toContainText('Duran');
  await expect(page.locator(`${CARD} .professional-summary-extra-body`)).toBeHidden();
  await capture(page, 'desktop-summary-abnormal');
  const before = await copySummary(page);
  expect(before).toContain('Waga:');
  expect(before).toContain('Wzrost:');
  expect(before).toContain('BMI:');
  await page.locator(`${CARD} .professional-summary-extras > summary`).click();
  await expect(page.locator(`${CARD} .professional-summary-extra-body`)).toBeVisible();
  expect(await copySummary(page)).toBe(before);
  await chart(page);
  expect(await copySummary(page)).toBe(before);
  await page.getByRole('tab', { name: 'Podsumowanie', exact: true }).click();
  await expect(page.locator(`${CARD} .professional-summary-extra-body`)).toBeVisible();
});

for (const source of ['OLAF', 'PALCZEWSKA']) {
  test(`${source}: odtworzona historia ma własne kolory i gradienty także po powiększeniu`, async ({ page }) => {
    await open(page);
    const record = patient({ height: 139, weight: 32, source, history: [
      { ageMonths: 96, height: 125, weight: 25 },
      { ageMonths: 120, height: 132, weight: 28 },
      { ageMonths: 132, height: 137, weight: 30 },
    ] });
    await saved(page, record);
    await chart(page);
    const points = page.locator(`${PREVIEW} .vilda-centile-live-preview-point`);
    await expect(points).toHaveCount(4);
    expect(await points.evaluateAll(nodes => nodes.map(node => node.dataset.tone))).toEqual(['neutral', 'warn', 'warn', 'danger']);
    const svgGradients = await page.locator(`${PREVIEW} linearGradient`).evaluateAll(nodes => nodes.map(node => [...node.querySelectorAll('stop')].map(stop => stop.getAttribute('stop-color'))));
    expect(svgGradients).toContainEqual(['#087c80', '#b97519']);
    expect(svgGradients).toContainEqual(['#b97519', '#bd4b50']);
    await capture(page, `desktop-chart-${source}`);
    expect(await page.evaluate(() => window.__summaryFullRenders)).toBe(0);
    await page.locator('#vildaSummaryChartPanel .vilda-centile-live-expand').click();
    await expect(page.locator(DIALOG)).toBeVisible({ timeout: 30_000 });
    await expect.poll(() => page.evaluate(() => window.__summaryFullRenders)).toBeGreaterThan(0);
    const full = page.locator(`${DIALOG} svg.vilda-centile-live-full-svg[data-metric="height"]`);
    await expect(full).toBeVisible();
    expect(await full.locator('.vilda-centile-live-full-point').evaluateAll(nodes => nodes.map(node => node.dataset.tone)))
      .toEqual(['neutral', 'warn', 'warn', 'danger']);
    await page.locator(`${DIALOG} [data-centile-live-metric="both"]`).click();
    await expect(page.locator(`${DIALOG} svg.vilda-centile-live-full-svg:visible`)).toHaveCount(2);
    const weight = page.locator(`${DIALOG} svg.vilda-centile-live-full-svg[data-metric="weight"]`);
    expect(await weight.locator('.vilda-centile-live-full-point').evaluateAll(nodes => nodes.map(node => node.dataset.tone)))
      .toEqual(['neutral', 'neutral', 'neutral', 'warn']);
    await page.locator(`${DIALOG} .vilda-centile-live-close`).click();
    await expect(page.locator(DIALOG)).toHaveCount(0);
    await expect(page.locator(PREVIEW)).toBeVisible();
    await expect(page.locator('#vildaSummaryChartPanel canvas')).toHaveCount(0);
  });
}

test('telefon: karta pod formularzem, zakładki z klawiatury i brak przewijania w bok', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await open(page, 'docpro');
  await fillDraft(page);
  await capture(page, 'mobile-summary');
  const summaryTab = page.getByRole('tab', { name: 'Podsumowanie', exact: true });
  const chartTab = page.getByRole('tab', { name: 'Siatka centylowa', exact: true });
  await summaryTab.focus();
  await summaryTab.press('ArrowRight');
  await expect(chartTab).toBeFocused();
  await expect(chartTab).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator(PREVIEW)).toBeVisible({ timeout: 30_000 });
  const bounds = await page.evaluate(() => ({
    formBottom: document.querySelector('#userSection fieldset.user-card').getBoundingClientRect().bottom,
    cardTop: document.getElementById('currentSummaryCard').getBoundingClientRect().top,
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  expect(bounds.cardTop).toBeGreaterThanOrEqual(bounds.formBottom - 1);
  expect(bounds.scrollWidth).toBeLessThanOrEqual(bounds.clientWidth + 1);
  await capture(page, 'mobile-chart');
  await chartTab.press('ArrowLeft');
  await expect(summaryTab).toBeFocused();
  await expect(summaryTab).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('#currentSummaryContent')).toBeVisible();
});

test('zapisany pacjent z jednym pomiarem: jeden punkt i brak sztucznego tempa wzrastania', async ({ page }) => {
  await open(page);
  const id = await saved(page, patient());
  await expect(page.locator(`${CARD} [data-summary-key="velocity"]`)).toContainText(/Brak|brak|wcześniejszego|poprzedniego/);
  await chart(page);
  await expect(page.locator(`${PREVIEW} .vilda-centile-live-preview-point`)).toHaveCount(1);
  const snapshot = await page.evaluate(() => window.VildaCentileLiveData.getSnapshot({ mode: 'summary' }));
  expect(snapshot.patientId).toBe(id);
  expect(snapshot.eligibility.choice).toBe('restore');
  const probes = await page.evaluate(snapshot => {
    const result = window.VildaCentileLiveRender.preview(snapshot);
    const age = result.height.points[0].ageMonths;
    return [result.height.probe(age - 1), result.height.probe(age + 1)];
  }, snapshot);
  expect(probes).toEqual([null, null]);
  await page.locator('#weight').fill('45');
  await page.locator('#weight').blur();
  expect(await page.evaluate(async () => Boolean(await window.saveUserData()))).toBe(true);
  await expect(page.getByRole('tab', { name: 'Siatka centylowa', exact: true })).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator(PREVIEW)).toBeVisible();
  await expect.poll(() => page.evaluate(() => window.VildaCentileLivePanel.getState().status)).toBe('ready');

  await page.evaluate(() => window.clearAllData());
  await expect(page.locator('#age')).toHaveValue('');
  await fillDraft(page, { height: 150, weight: 40 });
  await chart(page);
  const next = await page.evaluate(() => window.VildaCentileLiveData.getSnapshot({ mode: 'summary' }));
  expect(next.patientId).toBeNull();
  expect(next.currentHeight).toBe(150);
  expect(next.measurements).toHaveLength(0);
  expect(next.chartCreatorData).not.toEqual(snapshot.chartCreatorData);
});

test('odtworzony starszy zapis nie pobiera późniejszych punktów, rodziców ani adnotacji z bieżącej kartoteki', async ({ page }) => {
  await open(page);
  const old = patient({ height: 132, weight: 28, note: 'E2E-LIVE-OLD', history: [
    { ageMonths: 96, height: 125, weight: 25 },
  ] });
  Object.assign(old.user, { age: 10, measuredAtISO: '2024-06-17' });
  Object.assign(old.advanced.data, { currentAgeMonths: 120 });
  const latest = patient({ height: 139, weight: 32, note: 'E2E-LIVE-FUTURE', history: [
    { ageMonths: 96, height: 125, weight: 25 },
    { ageMonths: 120, height: 132, weight: 28 },
    { ageMonths: 132, height: 137, weight: 30 },
  ] });
  Object.assign(latest.advanced, { motherHeight: 170, fatherHeight: 190 });
  Object.assign(latest.advanced.data, { motherHeight: 170, fatherHeight: 190 });
  const id = await page.evaluate(async ({ old, latest }) => {
    const first = await window.VildaVault.savePatient(old, { dedup: false });
    await window.VildaVault.savePatient(latest, { patientId: first.patientId, dedup: false });
    return first.patientId;
  }, { old, latest });
  await loadPatient(page, id, 'restore');
  // Public import + restore APIs apply the selected historical payload while
  // the real vault deliberately retains a newer head for the same patient.
  await page.evaluate(payload => window.applyLoadedData(payload), old);
  await page.evaluate(() => { window.confirm = () => true; window.restoreLoadedState(); });
  await expect(page.locator('#height')).toHaveValue('132');
  await expect(page.locator('#age')).toHaveValue('10');
  await chart(page);
  const snapshot = await page.evaluate(() => window.VildaCentileLiveData.getSnapshot({ mode: 'summary' }));
  expect(snapshot.patientId).toBe(id);
  expect(snapshot.ageMonths).toBe(120);
  expect(snapshot.currentHeight).toBe(132);
  expect(snapshot.parents).toEqual({ motherHeight: 165, fatherHeight: 182 });
  expect(snapshot.measurements.every(row => row.ageMonths <= 120)).toBe(true);
  expect(JSON.stringify(snapshot.chartCreatorData)).toContain('E2E-LIVE-OLD');
  expect(JSON.stringify(snapshot.chartCreatorData)).not.toContain('E2E-LIVE-FUTURE');
  expect(await page.locator(`${PREVIEW} .vilda-centile-live-preview-point`).evaluateAll(points => points.map(point => Number(point.dataset.value))))
    .toEqual([125, 132]);
  const head = await page.evaluate(async id => (await window.VildaVault.getPatient(id)).snapshots[0].payload, id);
  expect(head.user.height).toBe(139);
  expect(head.advanced.fatherHeight).toBe(190);
});

test('wiek w dniu odtwarzanego pomiaru dopuszcza siatkę dziecięcą, a dorosły nowy pomiar jej nie pokazuje', async ({ page }) => {
  await open(page);
  const historical = patient({ height: 165, weight: 55 });
  Object.assign(historical.user, { age: 17, dobISO: '2007-06-17', measuredAtISO: '2024-06-17' });
  Object.assign(historical.advanced.data, { currentAgeMonths: 204 });
  const id = await saved(page, historical);
  await expect(page.locator('#age')).toHaveValue('17');
  await chart(page);
  const oldSnapshot = await page.evaluate(() => window.VildaCentileLiveData.getSnapshot({ mode: 'summary' }));
  expect(oldSnapshot.ageMonths).toBe(204);
  await loadPatient(page, id, 'new', { clear: true });
  await expect(page.locator('#age')).toHaveValue('19');
  await page.locator('#height').fill('165');
  await page.locator('#weight').fill('55');
  await page.locator('#weight').blur();
  await expect(page.locator('#prevSummaryWrap')).toBeVisible();
  await expect(page.getByRole('tab', { name: 'Siatka centylowa', exact: true })).toBeHidden();
  await expect(page.locator('#vildaCentileLiveMount')).toBeHidden();
  await expect(page.locator('#prevSummaryWrap')).toContainText('BMI');
});

test('powłoka SPA: nowy pacjent przechodzi ze Start do DocPro, a pełna siatka otwiera się nad ramkami', async ({ page }) => {
  const { frame: start } = await createFictionalVault(page, { shell: true });
  await start.waitForFunction(() => window.VildaSummaryTabs && window.VildaProfessionalSummary);
  await fillDraft(start);
  await chart(start);
  await start.evaluate(() => window.vildaPersistFlushNow({ force: true }));
  await page.evaluate(() => window.VildaShell.navigate('docpro'));
  const docpro = await shellFrame(page, 'DocPro');
  await readyForPatient(docpro);
  const confirmation = docpro.locator('#professionalConfirmBtn');
  if (await confirmation.isVisible()) await confirmation.click();
  await expect(docpro.locator('#height')).toHaveValue('155');
  await expect(docpro.locator('#weight')).toHaveValue('44');
  await expect(docpro.getByRole('tab', { name: 'Podsumowanie', exact: true })).toHaveAttribute('aria-selected', 'true');
  await chart(docpro);
  await expect(docpro.locator(`${PREVIEW} .vilda-centile-live-preview-point`)).toHaveCount(1);
  await docpro.locator('#vildaSummaryChartPanel .vilda-centile-live-expand').click();
  await expect(page.locator(DIALOG)).toBeVisible({ timeout: 30_000 });
  await expect(page.locator(`${DIALOG} svg.vilda-centile-live-full-svg:visible`)).toHaveCount(1);
  await page.locator(`${DIALOG} .vilda-centile-live-close`).click();
  await expect(page.locator(DIALOG)).toHaveCount(0);
  await expect(docpro.locator(PREVIEW)).toBeVisible();
});
