import { expect, test } from '../support/test-czas.mjs';
import { createFictionalVault, loadPatient, readyForPatient, shellFrame, clinicalFingerprint, fictionalPatient } from '../support/centile-live-fixture.mjs';
import { performance } from 'node:perf_hooks';
export { fictionalPatient, fixturePreferences, createFictionalVault, loadPatient, readyForPatient, shellFrame, clinicalFingerprint } from '../support/centile-live-fixture.mjs';

// Wyłącznie fikcyjny, zaszyfrowany sejf w efemerycznym profilu Playwrighta.
// Renderer, kolektor, wczytywanie pacjenta i obliczenia pozostają produkcyjne.
test.use({ serviceWorkers: 'block' });

const CARD = '.vilda-centile-live-card';
const TAB = '.vilda-centile-live-tab';
const PANE = '.vilda-centile-live-pane';

async function readyPanel(frame, patientId, source = 'OLAF') {
  try {
    await expect.poll(() => frame.evaluate(() => window.VildaCentileLivePanel?.getState()), { timeout: 30_000 })
      .toMatchObject({ eligible: true, status: 'ready', patientId, source });
  } catch (error) {
    const diagnostics = await frame.evaluate(async () => {
      const snapshot = await window.VildaCentileLiveData?.getSnapshot();
      const panel = window.VildaPanelPacjent;
      return {
        state: window.VildaCentileLivePanel?.getState(), lifecycle: window.__siatkaE2eLifecycle,
        mode: sessionStorage.getItem('vildaLoadChoiceV1'), patientId: sessionStorage.getItem('vildaCurrentPatientId'),
        fields: ['age', 'ageMonths', 'dobInput', 'height', 'weight'].map(id => ({ id, value: document.getElementById(id)?.value })),
        locked: !window.VildaVault?.isUnlocked(), owner: panel?.wlasciciel?.(), stale: panel?.nieaktualny?.(),
        applying: window.__vildaPersistRestoring, mirroring: window.__vildaLustroWpis,
        clearUntil: window.__vildaPersistClearUntil, now: Date.now(), dobPending: window.VildaDobAge?.restorePending?.(),
        sequence: window.VildaDataImportExport?.getApplyLoadedDataSequence?.(),
        grid: getComputedStyle(document.getElementById('calcForm')).gridTemplateColumns,
        dependencies: { readyState: document.readyState, view: !!window.VildaCentileLiveView, render: !!window.VildaCentileLiveRender, mount: !!document.getElementById('vildaCentileLiveMount') },
        fieldset: document.querySelector('#userSection fieldset.user-card')?.getBoundingClientRect().toJSON(),
        rects: ['userSection', 'doctorSection', 'vildaCentileLiveMount'].map(id => ({ id, rect: document.getElementById(id)?.getBoundingClientRect().toJSON() })),
        snapshot: snapshot && { patientId: snapshot.patientId, ageMonths: snapshot.ageMonths, source: snapshot.source, count: snapshot.measurements.length },
      };
    });
    await test.info().attach('live-centile-state.json', { body: JSON.stringify(diagnostics, null, 2), contentType: 'application/json' });
    throw error;
  }
}

async function settledClinicalFingerprint(frame, patientId) {
  await readyPanel(frame, patientId);
  let lastFingerprint, lastSerialized, stableSince;
  const transitions = [];
  try {
    await expect.poll(async () => {
      const startup = await frame.evaluate(() => ({
        patientId: sessionStorage.getItem('vildaCurrentPatientId'),
        mode: sessionStorage.getItem('vildaLoadChoiceV1'),
        owner: window.VildaPanelPacjent?.wlasciciel?.(),
        stale: window.VildaPanelPacjent?.nieaktualny?.(),
        restoring: !!window.__vildaPersistRestoring,
        mirroring: !!window.__vildaLustroWpis,
        suspendIntake: !!window.__vildaSuspendIntakeUserReset,
        pending: window.VildaDataImportExport.isMainSessionRestorePending(),
        paused: window.VildaDataImportExport.isMainSessionAutosavePaused(),
        suppressed: window.VildaPersistence.isAutosaveSuppressed(),
        dobPending: window.VildaDobAge.restorePending(),
        panel: window.VildaCentileLivePanel.getState(),
        intakeHistory: window.intakeHistory,
        intakeEstimatedKcalPerDay: window.intakeEstimatedKcalPerDay,
      }));
      const ready = startup.patientId === patientId && startup.mode === 'new'
        && startup.owner === patientId && !startup.stale
        && !startup.restoring && !startup.mirroring && !startup.suspendIntake
        && !startup.pending && !startup.paused && !startup.suppressed && !startup.dobPending
        && startup.panel.eligible && startup.panel.status === 'ready' && startup.panel.patientId === patientId;
      const fingerprint = await clinicalFingerprint(frame, patientId);
      const serialized = JSON.stringify(fingerprint);
      const now = performance.now();
      if (!ready || serialized !== lastSerialized || stableSince === undefined) {
        stableSince = ready ? now : undefined;
        transitions.push({ at: now, ready, startup, fingerprint });
        if (transitions.length > 20) transitions.shift();
      }
      lastFingerprint = fingerprint;
      lastSerialized = serialized;
      // custom-fixes dispatches delayed change events after 3200 ms. A ready
      // chart can precede them; the intake globals can be initialized or cleared.
      // Wait for the entire clinical state to settle beyond that event horizon,
      // rather than requiring a particular representation of another card.
      return ready && stableSince !== undefined && now - stableSince >= 3500;
    }, {
      timeout: 30_000,
      intervals: [100, 250],
      message: 'Dane i właściciel pacjenta są stabilne po odroczonej synchronizacji przed kontrolą braku mutacji',
    }).toBe(true);
  } catch (error) {
    await test.info().attach('live-centile-startup-transitions.json', {
      body: JSON.stringify({ patientId, transitions }, null, 2), contentType: 'application/json',
    });
    throw error;
  }
  return lastFingerprint;
}

async function productionPoint(frame, metric, ageMonths) {
  return frame.evaluate(async ({ metric, ageMonths }) => {
    const snapshot = await window.VildaCentileLiveData.getSnapshot();
    const fullscreen = window.VildaCentileLivePanel.getState().fullscreen;
    const rendered = window.VildaCentileLiveRender[fullscreen ? 'render' : 'preview'](snapshot);
    const rangeId = window.VildaCentileLivePanel.getState().rangeId;
    const range = rendered.ranges.find(item => item.id === rangeId) || rendered;
    const data = range[metric];
    const point = data.probe(ageMonths);
    return { ...point, width: data.width, height: data.height };
  }, { metric, ageMonths });
}

async function hoverPoint(page, frame, ui, metric, ageMonths = 120) {
  const point = await productionPoint(frame, metric, ageMonths);
  const panes = ui.locator(`${PANE}:visible`);
  const pane = metric === 'weight' && await panes.count() === 2 ? panes.nth(1) : panes.first();
  const preview = pane.locator('svg.vilda-centile-live-preview');
  let target;
  if (await preview.count()) {
    target = await preview.evaluate((svg, point) => {
      const r = svg.getBoundingClientRect(), d = svg.dataset;
      return {
        x: r.x + Number(d.plotX) + (point.ageMonths - Number(d.ageMin)) / (Number(d.ageMax) - Number(d.ageMin)) * Number(d.plotWidth),
        y: r.y + Number(d.plotY) + (Number(d.maxY) - point.value) / (Number(d.maxY) - Number(d.minY)) * Number(d.plotHeight),
      };
    }, point);
  } else {
    const canvas = await pane.locator('canvas.vilda-centile-live-full-background').boundingBox();
    expect(canvas).toBeTruthy();
    target = { x: canvas.x + point.x / point.width * canvas.width, y: canvas.y + point.y / point.height * canvas.height };
  }
  await page.mouse.move(target.x, target.y);
  await expect.poll(() => frame.evaluate(() => window.VildaCentileLivePanel.getState().ageMonths)).toBe(ageMonths);
  await expect(pane.locator('.vilda-centile-live-tooltip')).toBeVisible();
  const dot = await pane.locator('.vilda-centile-live-probe-dot').boundingBox();
  expect(dot.x + dot.width / 2).toBeCloseTo(target.x, 0);
  expect(dot.y + dot.height / 2).toBeCloseTo(target.y, 0);
  return { point, target, pane };
}

test('Start: zapisany pacjent i Nowy pomiar pokazują prawdziwą historię i adnotacje bez zmiany danych przez odczyt', async ({ page }) => {
  test.setTimeout(150_000);
  await page.setViewportSize({ width: 1536, height: 1120 });
  const { frame, ids, patients } = await createFictionalVault(page);
  await expect(page.locator('#vildaCentileLiveMount')).toBeHidden();
  await loadPatient(frame, ids.a);
  await readyPanel(frame, ids.a);
  const card = page.locator(CARD);
  await expect(card).toBeVisible();
  await expect(card.locator('svg.vilda-centile-live-preview')).toHaveCount(1);
  await expect(card.locator('canvas.vilda-centile-live-full-background')).toHaveCount(0);
  await expect(card.locator(`${TAB}[data-centile-live-metric="both"]`)).toBeHidden();
  expect(await frame.evaluate(() => window.__siatkaE2eTexts.includes('E2E-LIVE-A')), 'adnotacje powstają dopiero po powiększeniu').toBe(false);
  expect(await frame.evaluate(() => window.chartCreatorData)).toEqual(patients.a.chartCreator);

  const before = await settledClinicalFingerprint(frame, ids.a);
  const { point, target, pane } = await hoverPoint(page, frame, card, 'height');
  expect(point.value).toBe(141);
  await expect(pane.locator('.vilda-centile-live-tooltip-reading')).toContainText('141 cm');
  const style = await pane.locator('.vilda-centile-live-tooltip').evaluate(el => ({
    color: getComputedStyle(el).color, background: getComputedStyle(el).backgroundColor,
    opacity: getComputedStyle(el).opacity, filter: getComputedStyle(el).backdropFilter,
  }));
  expect(style).toEqual({ color: 'rgb(17, 17, 17)', background: 'rgba(255, 255, 255, 0.85)', opacity: '1', filter: 'none' });
  await page.mouse.click(target.x, target.y);
  await expect.poll(() => frame.evaluate(() => window.VildaCentileLivePanel.getState().pinned)).toBe(true);
  await page.mouse.move(target.x + 35, target.y + 30);
  expect((await frame.evaluate(() => window.VildaCentileLivePanel.getState())).ageMonths).toBe(120);
  await page.mouse.click(target.x, target.y);
  const plane = pane.locator('.vilda-centile-live-interaction');
  await plane.focus();
  await page.keyboard.press('Home');
  await expect.poll(() => frame.evaluate(() => window.VildaCentileLivePanel.getState().pinned)).toBe(true);
  await page.keyboard.press('Enter');
  await expect.poll(() => frame.evaluate(() => window.VildaCentileLivePanel.getState().pinned)).toBe(false);
  expect((await frame.evaluate(() => window.VildaCentileLivePanel.getState())).fullscreen).toBe(false);
  expect(await clinicalFingerprint(frame, ids.a)).toEqual(before);

  await card.locator('.vilda-centile-live-expand').click();
  await expect(page.locator('.vilda-centile-live-dialog')).toBeVisible();
  await expect.poll(() => frame.evaluate(() => window.__siatkaE2eTexts.includes('E2E-LIVE-A'))).toBe(true);
  await page.locator('.vilda-centile-live-close').click();
  await expect(page.locator('.vilda-centile-live-dialog')).toHaveCount(0);
  await expect(card.locator('svg.vilda-centile-live-preview')).toBeVisible();
  expect(await clinicalFingerprint(frame, ids.a)).toEqual(before);

  const collapsed = await card.boundingBox();
  await page.locator('#tannerToggleBtn').click();
  await expect(page.locator('#tannerStageWrap')).toBeVisible();
  await expect.poll(async () => Math.abs((await card.boundingBox()).height - collapsed.height)).toBeLessThanOrEqual(1);
  await page.setViewportSize({ width: 1000, height: 1120 });
  await readyPanel(frame, ids.a);
  await frame.evaluate(() => new Promise(resolve => { requestAnimationFrame(() => requestAnimationFrame(resolve)); }));
  const expandedNarrow = await card.boundingBox();
  const heightDetails = () => frame.evaluate(() => {
    const panel = document.getElementById('tannerStageWrap');
    const visible = el => el && el.getClientRects().length && getComputedStyle(el).display !== 'none';
    let previous = panel.previousElementSibling, next = panel.nextElementSibling;
    while (previous && !visible(previous)) previous = previous.previousElementSibling;
    while (next && !visible(next)) next = next.nextElementSibling;
    const describe = el => {
      if (!el) return null;
      const style = getComputedStyle(el);
      return { id: el.id, tag: el.tagName, rect: el.getBoundingClientRect().toJSON(),
        marginTop: style.marginTop, marginBottom: style.marginBottom, paddingTop: style.paddingTop,
        paddingBottom: style.paddingBottom, display: style.display };
    };
    return { fieldset: describe(document.querySelector('#userSection .user-card')), panel: describe(panel), previous: describe(previous), next: describe(next),
      card: describe(document.querySelector('.vilda-centile-live-card')) };
  });
  const expandedDetails = await heightDetails();
  await page.locator('#tannerToggleBtn').click();
  await expect(page.locator('#tannerStageWrap')).toBeHidden();
  try {
    await expect.poll(async () => Math.abs((await card.boundingBox()).height - expandedNarrow.height)).toBeLessThanOrEqual(1);
  } catch (error) {
    await test.info().attach('tanner-height.json', { body: JSON.stringify({ expanded: expandedDetails, collapsed: await heightDetails() }, null, 2), contentType: 'application/json' });
    throw error;
  }
});

test('widoczność: bez zapisu, Odtwórz, pełnoletność, telefon i blokada nie pokazują panelu nowego pomiaru', async ({ page }) => {
  test.setTimeout(150_000);
  await page.setViewportSize({ width: 1536, height: 1120 });
  const { frame, ids } = await createFictionalVault(page);
  await page.locator('#lastName').fill('Fikcyjny');
  await page.locator('#firstName').fill('Bez zapisu');
  await page.locator('#age').fill('13');
  await page.locator('#height').fill('141');
  await page.locator('#weight').fill('33');
  await frame.evaluate(() => window.VildaCentileLivePanel.refresh());
  await expect(page.locator('#vildaCentileLiveMount')).toBeHidden();

  await loadPatient(frame, ids.a, 'restore', { clear: true });
  await frame.evaluate(() => window.VildaCentileLivePanel.refresh());
  await expect(page.locator('#vildaCentileLiveMount')).toBeHidden();
  expect((await frame.evaluate(() => window.VildaCentileLivePanel.getState())).eligible).toBe(false);
  await loadPatient(frame, ids.a, 'new', { clear: true });
  await readyPanel(frame, ids.a);

  const adult = await frame.evaluate(async payload => (await window.VildaVault.savePatient(payload, { dedup: false })).patientId,
    fictionalPatient({ firstName: 'Pelnoletni', age: 18, height: 179, weight: 70 }));
  await loadPatient(frame, adult, 'new', { clear: true });
  await frame.evaluate(() => window.VildaCentileLivePanel.refresh());
  await expect(page.locator('#vildaCentileLiveMount')).toBeHidden();
  await loadPatient(frame, ids.a, 'new', { clear: true });
  await readyPanel(frame, ids.a);
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator('#vildaCentileLiveMount')).toBeHidden();
  await expect(page.locator(CARD)).toHaveCount(0);
  const overflow = await page.evaluate(() => document.scrollingElement.scrollWidth - document.scrollingElement.clientWidth);
  expect(overflow, 'telefon nie dostaje panelu ani poziomego przewijania').toBeLessThanOrEqual(1);
  await page.setViewportSize({ width: 1536, height: 1120 });
  await readyPanel(frame, ids.a);
  await frame.evaluate(() => window.VildaVault.lock());
  await expect(page.locator(CARD)).toHaveCount(0);
  expect(await frame.evaluate(() => window.VildaCentileLiveData.getSnapshot())).toBeNull();
});

test('DocPro: Nowy pomiar dziedziczy wybraną na Start siatkę Palczewskiej, historię i adnotacje', async ({ page }) => {
  test.setTimeout(150_000);
  await page.setViewportSize({ width: 1536, height: 1120 });
  const { ids } = await createFictionalVault(page);
  await loadPatient(page, ids.a, 'new', { clear: true });
  await readyPanel(page, ids.a);
  await hoverPoint(page, page, page.locator(CARD), 'height');
  const vaultBefore = (await clinicalFingerprint(page, ids.a)).vaultSnapshots;
  const creatorBefore = await page.evaluate(() => JSON.parse(JSON.stringify(window.chartCreatorData)));
  await page.locator('#height').fill('158');
  await page.locator('#weight').fill('46');
  await expect(page.locator('#dataToggleContainer')).toBeVisible();
  const radio = page.locator('#sourcePalczewska');
  await page.locator('#dataToggleContainer label').filter({ has: radio }).click();
  await expect(radio).toBeChecked();
  await readyPanel(page, ids.a, 'PALCZEWSKA');
  await expect(page.locator(CARD).locator('.vilda-centile-live-source')).toContainText('Palczewska');
  expect(await page.evaluate(() => window.chartCreatorData)).toEqual(creatorBefore);
  expect((await clinicalFingerprint(page, ids.a)).vaultSnapshots).toEqual(vaultBefore);

  // DocPro celowo ukrywa ogólną kartę BMI i jej przełącznik źródła.
  // Przechodzimy prawdziwą drogą lekarza: wybór na Start → odtworzenie sesji w DocPro.
  await page.goto('/docpro.html', { waitUntil: 'load' });
  await readyForPatient(page);
  const confirmation = page.locator('#professionalConfirmBtn');
  if (await confirmation.isVisible()) await confirmation.click();
  await readyPanel(page, ids.a, 'PALCZEWSKA');
  const card = page.locator(CARD);
  await expect(card).toBeVisible();
  await expect(card.locator('.vilda-centile-live-source')).toContainText('Palczewska');
  expect(await page.evaluate(() => window.__siatkaE2eTexts.includes('E2E-LIVE-A'))).toBe(false);
  expect(await page.evaluate(() => window.chartCreatorData)).toEqual(creatorBefore);
  expect((await clinicalFingerprint(page, ids.a)).vaultSnapshots).toEqual(vaultBefore);
  const before = await clinicalFingerprint(page, ids.a);
  await card.locator(`${TAB}[data-centile-live-metric="weight"]`).click();
  const { point, pane } = await hoverPoint(page, page, card, 'weight');
  expect(point.value).toBe(33);
  await expect(pane.locator('.vilda-centile-live-tooltip-reading')).toContainText('33');
  await card.locator(`${TAB}[data-centile-live-metric="height"]`).click();
  await hoverPoint(page, page, card, 'height');
  expect(await clinicalFingerprint(page, ids.a)).toEqual(before);
  await card.locator('.vilda-centile-live-expand').click();
  await expect(page.locator('.vilda-centile-live-dialog')).toBeVisible();
  await expect.poll(() => page.evaluate(() => window.__siatkaE2eTexts.includes('E2E-LIVE-A'))).toBe(true);
  await page.locator('.vilda-centile-live-close').click();
  await expect(page.locator('.vilda-centile-live-dialog')).toHaveCount(0);
  await expect(card.locator('svg.vilda-centile-live-preview')).toBeVisible();
  expect(await clinicalFingerprint(page, ids.a)).toEqual(before);
});

test('SPA: Start i DocPro przenoszą tę samą kartę do host fullscreen, zachowują kotwice i cofają focus', async ({ page }) => {
  test.setTimeout(180_000);
  await page.setViewportSize({ width: 1536, height: 1120 });
  const { frame: start, ids } = await createFictionalVault(page, { shell: true });
  await loadPatient(start, ids.a);
  await readyPanel(start, ids.a);
  const before = await settledClinicalFingerprint(start, ids.a);
  const initial = await start.locator(CARD).boundingBox();
  await start.evaluate(() => { window.__siatkaOriginalCard = document.querySelector('.vilda-centile-live-card'); });
  await start.getByRole('button', { name: 'Powiększ siatkę na pełny ekran', exact: true }).click();
  const dialog = page.locator('.vilda-centile-live-dialog');
  await expect(dialog).toBeVisible();
  await expect(start.locator(CARD)).toHaveCount(0);
  expect(await start.evaluate(() => window.__siatkaOriginalCard.ownerDocument === window.parent.document)).toBe(true);
  const card = dialog.locator(CARD);
  await card.locator(`${TAB}[data-centile-live-metric="both"]`).click();
  await expect(card.locator(`${PANE}:visible`)).toHaveCount(2);
  for (const metric of ['height', 'weight']) await hoverPoint(page, start, card, metric);
  const geometry = await card.evaluate(root => {
    const panes = [...root.querySelectorAll('.vilda-centile-live-pane')].filter(el => !el.hidden);
    return {
      rect: root.getBoundingClientRect().toJSON(),
      panes: panes.map(pane => {
        const canvas = pane.querySelector('canvas.vilda-centile-live-full-background');
        const image = canvas.getBoundingClientRect();
        return { width: image.width, height: image.height, intrinsicWidth: canvas.width, intrinsicHeight: canvas.height,
          viewport: pane.querySelector('.vilda-centile-live-viewport').getBoundingClientRect().toJSON(),
          frame: pane.querySelector('.vilda-centile-live-image-frame').getBoundingClientRect().toJSON() };
      }),
      mph: root.querySelector('.vilda-centile-live-mph').getBoundingClientRect().toJSON(),
      mphData: { ...root.querySelector('.vilda-centile-live-mph').dataset },
      mphLabel: root.querySelector('.vilda-centile-live-mph-label').getBoundingClientRect().toJSON(),
      cursor: getComputedStyle(root.querySelector('.vilda-centile-live-interaction')).cursor,
    };
  });
  expect(geometry.rect.width, 'fullscreen obejmuje okno, nie szerokość iframe').toBeGreaterThan(1500);
  expect(geometry.rect.height).toBeGreaterThan(1080);
  const scales = geometry.panes.map(pane => pane.width / pane.intrinsicWidth);
  expect(scales[0]).toBeCloseTo(scales[1], 5);
  for (const pane of geometry.panes) {
    expect(pane.width / pane.height).toBeCloseTo(pane.intrinsicWidth / pane.intrinsicHeight, 3);
    expect(pane.frame.left).toBeGreaterThanOrEqual(pane.viewport.left - 1);
    expect(pane.frame.right).toBeLessThanOrEqual(pane.viewport.right + 1);
    expect(pane.frame.bottom).toBeLessThanOrEqual(pane.viewport.bottom + 1);
  }
  expect(geometry.mph.width).toBe(6);
  expect(geometry.mph.height).toBe(6);
  expect(geometry.mphData).toMatchObject({ ageMonths: '216', value: '179' });
  expect(geometry.mphLabel.left).toBeGreaterThan(geometry.mph.left + geometry.mph.width);
  expect(geometry.mphLabel.right).toBeLessThanOrEqual(geometry.panes[0].viewport.right - 1);
  expect(geometry.cursor).toBe('default');
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(start.locator(CARD)).toBeVisible();
  await expect(start.locator('svg.vilda-centile-live-preview')).toBeVisible();
  await expect(start.locator('canvas.vilda-centile-live-full-background')).toHaveCount(0);
  await expect.poll(() => start.evaluate(() => document.activeElement?.classList.contains('vilda-centile-live-expand'))).toBe(true);
  const restored = await start.locator(CARD).boundingBox();
  expect(restored.width).toBeCloseTo(initial.width, 0);
  expect(restored.height).toBeCloseTo(initial.height, 0);
  expect(await clinicalFingerprint(start, ids.a)).toEqual(before);

  await page.evaluate(() => window.VildaShell.navigate('docpro'));
  const docpro = await shellFrame(page, 'DocPro');
  await readyForPatient(docpro);
  const confirmation = docpro.locator('#professionalConfirmBtn');
  if (await confirmation.isVisible()) await confirmation.click();
  await loadPatient(docpro, ids.a, 'new', { clear: true });
  await readyPanel(docpro, ids.a);
  await docpro.getByRole('button', { name: 'Powiększ siatkę na pełny ekran', exact: true }).click();
  await expect(dialog).toBeVisible();
  await expect(docpro.locator('.vilda-centile-live-dialog')).toHaveCount(0);
  await expect(page.locator(`${CARD} canvas.vilda-centile-live-full-background`)).toHaveCount(1);
  await page.evaluate(() => window.VildaShell.navigate('start'));
  await expect(dialog).toHaveCount(0);
  await expect(docpro.locator(CARD)).toHaveCount(0);
});

test('pending pacjent i blokada odrzucają spóźniony odczyt prawdziwego rekordu sejfu', async ({ page }) => {
  test.setTimeout(150_000);
  await page.setViewportSize({ width: 1536, height: 1120 });
  const { frame, ids } = await createFictionalVault(page);
  await loadPatient(frame, ids.a);
  await readyPanel(frame, ids.a);
  await frame.evaluate(patientId => {
    const getPatient = window.VildaVault.getPatient;
    window.__siatkaReadHeld = false;
    window.__siatkaReleaseRead = null;
    window.__siatkaE2eTexts = [];
    window.VildaVault.getPatient = async function (...args) {
      const record = await getPatient.apply(this, args);
      if (args[0] === patientId && sessionStorage.getItem('vildaCurrentPatientId') === patientId
        && sessionStorage.getItem('vildaLoadChoiceV1') === 'new') {
        window.__siatkaReadHeld = true;
        await new Promise(resolve => { window.__siatkaReleaseRead = resolve; });
      }
      return record;
    };
    window.__siatkaRestoreVaultMethod = () => { window.VildaVault.getPatient = getPatient; };
  }, ids.b);
  await frame.evaluate(patientId => window.VildaAuthUI.showPatientCard(patientId, record => {
    if (record) window.applyLoadedData(record);
  }, null), ids.b);
  await expect.poll(() => page.evaluate(() => window.VildaSaveStatusIndicator.getCurrentDecision().ready)).toBe(true);
  await page.getByRole('button', { name: 'Wczytaj tego pacjenta' }).click();
  const choices = page.locator('#vildaLoadChoiceModal');
  const guard = page.getByRole('dialog', { name: /^Zapisać (wpisane dane|zmiany) przed wczytaniem\?$/ });
  await expect(choices.or(guard)).toBeVisible();
  if (await guard.isVisible()) await guard.getByRole('button', { name: /^Odrzuć (dane|zmiany) i wczytaj$/ }).click();
  await expect(choices).toBeVisible();
  await expect(page.locator(CARD)).toHaveCount(0);
  expect((await frame.evaluate(() => window.VildaCentileLivePanel.getState())).eligible).toBe(false);
  await page.locator('#vildaLcmNew').click();
  await frame.waitForFunction(() => window.__siatkaReadHeld && typeof window.__siatkaReleaseRead === 'function');
  await frame.evaluate(() => window.VildaVault.lock());
  await frame.evaluate(() => {
    window.__siatkaRestoreVaultMethod();
    window.__siatkaReleaseRead();
  });
  await frame.evaluate(() => window.VildaCentileLivePanel.refresh());
  await expect(page.locator(CARD)).toHaveCount(0);
  expect(await frame.evaluate(() => window.VildaCentileLiveData.getSnapshot())).toBeNull();
  expect(await frame.evaluate(() => window.__siatkaE2eTexts.includes('E2E-LIVE-B'))).toBe(false);
});
