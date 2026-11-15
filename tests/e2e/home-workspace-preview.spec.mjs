import { expect, test } from '../support/test-czas.mjs';
import { createFictionalVault, fictionalPatient, loadPatient } from '../support/centile-live-fixture.mjs';

test.use({ serviceWorkers: 'block', reducedMotion: 'reduce' });
test.setTimeout(180_000);

const NATIVE_IDS = ['firstName', 'lastName', 'name', 'dobInput', 'age', 'ageMonths', 'sex', 'height', 'weight',
  'currentSummaryCard', 'currentSummaryContent', 'metabolicSummaryBtn', 'clearAllDataBtn',
  'resultsModeToggle', 'dataToggleContainer', 'sourcePalczewska', 'sourceOlaf', 'sourceWho'];

function withoutCaptureTime(payload) {
  // Capture time changes on collection; measurement date, visit identity,
  // clinical values, history and every other persisted field still count.
  const result = structuredClone(payload);
  delete result.timestampISO;
  return result;
}

function withoutPresentationMode(payload) {
  const result = withoutCaptureTime(payload);
  delete result.zscore.resultsMode;
  return result;
}

async function installWorkspace(page, { enabled = true } = {}) {
  await page.addInitScript(({ enabled, ids }) => {
    window.__VILDA_HOME_WORKSPACE_PREVIEW__ = enabled || sessionStorage.getItem('__homeE2eEnableWorkspace') === 'true';
    window.__homeCopiedSummaries = [];
    window.__homeModeChanges = [];
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: {
      writeText(text) { window.__homeCopiedSummaries.push(text); return Promise.resolve(); }
    } });
    // Registered before deferred scripts: capture actual native nodes before
    // workspace.start() moves them, rather than testing only a second start.
    document.addEventListener('DOMContentLoaded', () => {
      window.__homeNativeNodes = ids.map(id => document.getElementById(id));
    }, { once: true });
    document.addEventListener('change', event => {
      if (event.target.id !== 'resultsModeToggle') return;
      window.__homeModeChanges.push({
        checked: event.target.checked,
        access: window.VildaProAccess?.hasAccess() === true,
        unlocked: window.VildaVault?.isUnlocked() === true,
        authReady: window.VildaAuthUI?.isBootReady() === true,
        restoring: !!(window.__vildaPersistRestoring || window.__vildaSuspendIntakeUserReset
          || window.VildaDataImportExport?.isMainSessionRestorePending() || window.VildaDobAge?.restorePending()),
      });
    }, true);
  }, { enabled, ids: NATIVE_IDS });
  await page.route('**/*', route => {
    const url = new URL(route.request().url());
    return url.hostname === '127.0.0.1' || /^(data|blob):$/.test(url.protocol) ? route.continue() : route.abort();
  });
}

async function settledRestore(page) {
  // Read-only: readyForPatient() also enables the native toggle, which would
  // conceal a missing workspace doctor-mode policy after Restore or reload.
  await page.waitForFunction(() => window.VildaVault?.isUnlocked() && window.VildaAuthUI?.isBootReady()
    && window.VildaPersistRuntime?.getSnapshot().initialized && window.VildaSummaryTabs
    && typeof window.collectUserData === 'function' && !window.__vildaPersistRestoring
    && !window.__vildaLustroWpis && !window.__vildaSuspendIntakeUserReset
    && !window.VildaDataImportExport?.isMainSessionRestorePending()
    && !window.VildaDobAge?.restorePending());
  await page.evaluate(() => new Promise(resolve => { requestAnimationFrame(() => { requestAnimationFrame(resolve); }); }));
}

async function openWorkspace(page) {
  await installWorkspace(page);
  const fixture = await createFictionalVault(page);
  await loadPatient(page, fixture.ids.a, 'restore');
  await settledRestore(page);
  await expect(page.locator('html')).toHaveClass(/vilda-home-workspace/);
  await expect(page.locator('#currentSummaryCard')).toBeVisible();
  return fixture;
}

async function collect(page) {
  return withoutCaptureTime(await page.evaluate(() => window.collectUserData()));
}

async function geometry(page) {
  return page.evaluate(() => {
    const node = id => document.getElementById(id), bounds = id => node(id).getBoundingClientRect();
    const input = document.querySelector('#userSection fieldset.user-card'), form = input.getBoundingClientRect();
    const clear = bounds('clearAllDataBtn'), copy = bounds('metabolicSummaryBtn');
    const first = bounds('firstName'), last = bounds('lastName'), dob = bounds('dobInput'), sex = bounds('sex');
    const weight = bounds('weight'), height = bounds('height'), summary = bounds('currentSummaryCard');
    const doctor = bounds('doctorSection'), strip = bounds('vildaStatusSide'), card = node('currentSummaryCard');
    const stripVisible = node('vildaStatusSide').getClientRects().length > 0;
    return {
      pairs: [Math.abs(clear.width - copy.width), Math.abs(clear.height - copy.height), Math.abs(clear.top - copy.top),
        Math.abs(first.width - last.width), Math.abs(first.top - last.top), Math.abs(dob.width - sex.width),
        Math.abs(dob.top - sex.top), Math.abs(weight.width - height.width), Math.abs(weight.top - height.top)],
      columns: getComputedStyle(node('calcForm')).gridTemplateColumns.trim().split(/\s+/).length,
      // The legacy status host can legitimately remain hidden while Chrome
      // owns the saved-state chip. Never manufacture a status to align against.
      topGap: Math.abs(form.top - (stripVisible ? strip.top : doctor.top)),
      topAnchor: stripVisible ? 'native-status' : 'doctor-column',
      bottomGap: Math.abs(form.bottom - summary.bottom),
      stacked: doctor.top >= form.bottom - 1 && Math.abs(doctor.left - form.left) <= 1,
      formMinimum: parseFloat(getComputedStyle(input).minHeight) || 0,
      doctorMinimum: parseFloat(getComputedStyle(node('doctorSection')).minHeight) || 0,
      matched: card.classList.contains('vilda-summary-height-matched'),
      cardConstraint: card.style.getPropertyValue('--vilda-summary-card-height'),
      contentConstraint: node('currentSummaryContent').style.getPropertyValue('--vilda-summary-content-height'),
      formHeight: form.height, cardHeight: summary.height,
      overflow: document.documentElement.scrollWidth > innerWidth + 1,
    };
  });
}

test.afterEach(async ({ page }, info) => {
  if (info.status === info.expectedStatus || page.isClosed()) return;
  const state = await page.evaluate(() => ({
    classes: document.documentElement.className,
    checked: document.getElementById('resultsModeToggle')?.checked,
    professionalMode: window.professionalMode,
    access: window.VildaProAccess?.hasAccess(), unlocked: window.VildaVault?.isUnlocked(),
    authReady: window.VildaAuthUI?.isBootReady(),
    restoring: window.__vildaPersistRestoring, mirror: window.__vildaLustroWpis,
    intakeReset: window.__vildaSuspendIntakeUserReset,
    mainPending: window.VildaDataImportExport?.isMainSessionRestorePending(),
    dobPending: window.VildaDobAge?.restorePending(), modeChanges: window.__homeModeChanges,
    tabs: window.VildaSummaryTabs?.getState(), chart: window.VildaCentileLivePanel?.getState(),
  })).catch(() => null);
  await info.attach('workspace-state.json', { body: JSON.stringify(state, null, 2), contentType: 'application/json' });
});

test('preview workspace: equal fields, centered actions and native summary geometry from phone through wide desktop', async ({ page }) => {
  await openWorkspace(page);
  const before = await collect(page);
  for (const width of [320, 390, 820, 850, 851, 1440, 1920]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.mouse.move(0, 0);
    await expect.poll(async () => {
      const result = await geometry(page);
      const valid = result.pairs.every(delta => delta <= 1) && !result.overflow
        && (width <= 850 ? result.columns === 1 && result.stacked && !result.matched
          : result.columns === 2 && result.topGap <= 1 && result.bottomGap <= 1);
      return valid ? null : result;
    }, { message: `native workspace geometry at ${width}px` }).toBeNull();
    const results = await geometry(page);
    if (width <= 850) {
      expect(results.cardConstraint).toBe('');
      expect(results.contentConstraint).toBe('');
      expect(results.formMinimum).toBe(0);
      expect(results.doctorMinimum).toBe(0);
    }
    if (width <= 600) {
      await expect(page.locator('.vhome-visit-title')).toBeHidden();
      await expect(page.locator('#clearAllDataBtn .vhome-action-compact')).toHaveText('Wyczyść');
      await expect(page.locator('#metabolicSummaryBtn .vhome-action-compact')).toHaveText('Skopiuj wyniki');
      await expect(page.locator('#clearAllDataBtn .vhome-action-full')).toBeHidden();
    } else {
      await expect(page.locator('#clearAllDataBtn .vhome-action-full')).toHaveText('Wyczyść formularz');
      await expect(page.locator('#metabolicSummaryBtn .vhome-action-full')).toHaveText('Podsumowanie wyników');
    }
    await expect(page.locator('#clearAllDataBtn')).toHaveAccessibleName('Wyczyść formularz');
    await expect(page.locator('#metabolicSummaryBtn')).toHaveAccessibleName('Podsumowanie wyników');
    const centered = await page.locator('.vhome-form-actions > button').evaluateAll(buttons => buttons.map(button => {
      const rect = button.getBoundingClientRect(), label = button.querySelector('.vhome-action-label').getBoundingClientRect();
      return { x: Math.abs(rect.x + rect.width / 2 - label.x - label.width / 2),
        y: Math.abs(rect.y + rect.height / 2 - label.y - label.height / 2), height: rect.height };
    }));
    for (const label of centered) {
      expect(label.x, `${width}px horizontal text center`).toBeLessThanOrEqual(1);
      expect(label.y, `${width}px vertical text center`).toBeLessThanOrEqual(1);
      expect(label.height).toBeGreaterThanOrEqual(44);
    }
    await page.getByRole('tab', { name: 'Siatka centylowa', exact: true }).click();
    await expect(page.locator('#vildaSummaryChartPanel svg.vilda-centile-live-preview')).toBeVisible();
    const chart = await geometry(page);
    expect(Math.abs(chart.formHeight - results.formHeight), `${width}px form does not grow with its chart tab`).toBeLessThanOrEqual(1);
    if (width > 850) expect(Math.abs(chart.cardHeight - results.cardHeight)).toBeLessThanOrEqual(1);
    await page.getByRole('tab', { name: 'Podsumowanie', exact: true }).click();
    await page.mouse.move(0, 0);
    await expect(page.locator('#currentSummaryContent')).toBeVisible();
    await expect.poll(async () => Math.abs((await geometry(page)).cardHeight - results.cardHeight)).toBeLessThanOrEqual(1);
    await page.screenshot({ path: test.info().outputPath(`workspace-${width}.png`), fullPage: false });
  }
  expect(await collect(page)).toEqual(before);
});

test('preview workspace: native nodes, calculations, history, clipboard and guarded clear retain their owners', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const fixture = await openWorkspace(page);
  await expect(page.locator('.vhome-visit-date')).toHaveText('17.06.2026');
  await expect(page.locator('#firstName')).toHaveValue('Antoni');
  await expect(page.locator('#lastName')).toHaveValue('Fikcyjny');
  expect(await page.evaluate(() => window.__homeNativeNodes.every(node => node
    && document.getElementById(node.id) === node && document.querySelectorAll('#' + node.id).length === 1))).toBe(true);
  expect(await page.evaluate(() => document.getElementById('height').ownerDocument === document
    && document.getElementById('height').form === document.getElementById('calcForm'))).toBe(true);
  const before = await collect(page);
  await page.evaluate(() => { window.VildaHomeWorkspace.start(); window.VildaHomeWorkspace.refresh(); });
  expect(await collect(page)).toEqual(before);
  const saved = await page.evaluate(id => window.VildaVault.getPatient(id), fixture.ids.a);
  await page.locator('.vhome-history-button').click();
  const history = page.getByRole('dialog', { name: 'Historia wizyt', exact: true });
  await expect(history.locator('.vvisit-visit')).toHaveCount(1);
  await history.getByRole('button', { name: 'Zamknij', exact: true }).click();
  await expect(history).toHaveCount(0);
  expect(await page.evaluate(id => window.VildaVault.getPatient(id), fixture.ids.a)).toEqual(saved);
  expect(await collect(page)).toEqual(before);
  await page.locator('#metabolicSummaryBtn').click();
  await expect.poll(() => page.evaluate(() => window.__homeCopiedSummaries.length)).toBe(1);
  const copied = await page.evaluate(() => window.__homeCopiedSummaries[0]);
  expect(copied).toContain('BMI:');
  await page.getByRole('tab', { name: 'Siatka centylowa', exact: true }).click();
  await expect(page.locator('#vildaSummaryChartPanel svg.vilda-centile-live-preview')).toBeVisible();
  await page.locator('#metabolicSummaryBtn').click();
  await expect.poll(() => page.evaluate(() => window.__homeCopiedSummaries.length)).toBe(2);
  expect(await page.evaluate(() => window.__homeCopiedSummaries[1])).toBe(copied);
  expect(await collect(page)).toEqual(before);
  await page.locator('#height').fill('160');
  await page.locator('#height').blur();
  await expect.poll(() => page.evaluate(() => Number(window.collectUserData().user.height))).toBe(160);
  await page.locator('#clearAllDataBtn').click();
  const clear = page.getByRole('dialog', { name: /^Zapisać (wpisane dane|zmiany) przed wyczyszczeniem\?$/ });
  await expect(clear).toBeVisible();
  await clear.getByRole('button', { name: /^Odrzuć (dane|zmiany) i wyczyść$/ }).click();
  await expect(page.locator('#height')).toHaveValue('');
  await expect(page.locator('#weight')).toHaveValue('');
  await expect(page.locator('.vhome-history-button')).toBeDisabled();
  await expect(page.locator('#metabolicSummaryBtn')).toBeDisabled();
  expect(await page.evaluate(id => window.VildaVault.getPatient(id), fixture.ids.a)).toEqual(saved);
});

test('preview workspace: original reference radios retain manual choice through restore and native comparison gates', async ({ page }) => {
  const fixture = await openWorkspace(page);
  await expect(page.locator('.vhome-reference > #dataToggleContainer')).toHaveCount(1);
  await expect(page.locator('.vhome-reference input[name=dataSource]')).toHaveCount(3);
  expect(await page.evaluate(() => window.__homeNativeNodes.filter(node => /^(dataToggleContainer|source)/.test(node.id))
    .every(node => document.getElementById(node.id) === node))).toBe(true);
  await page.locator('#dataToggleContainer label:has(#sourcePalczewska)').click();
  await expect(page.locator('#sourcePalczewska')).toBeChecked();
  await expect.poll(() => page.evaluate(() => window.collectUserData().zscore.dataSource)).toBe('PALCZEWSKA');
  await expect(page.locator('#dataToggleContainer')).toHaveAttribute('data-manual', '1');
  await expect(page.locator('#dataToggleContainer')).toHaveAttribute('data-preferred-source', 'PALCZEWSKA');
  const payload = await collect(page);
  const manualId = await page.evaluate(async record => (await window.VildaVault.savePatient(record, { dedup: false })).patientId, payload);
  await loadPatient(page, fixture.ids.b, 'restore');
  await settledRestore(page);
  await loadPatient(page, manualId, 'restore');
  await settledRestore(page);
  await expect(page.locator('#sourcePalczewska')).toBeChecked();
  expect((await collect(page)).zscore.dataSource).toBe(payload.zscore.dataSource);
  await page.getByRole('tab', { name: 'Siatka centylowa', exact: true }).click();
  await expect(page.locator('#vildaSummaryChartPanel svg.vilda-centile-live-preview')).toBeVisible();
  expect(await page.evaluate(async () => {
    const snapshot = await window.VildaCentileLiveData.getSnapshot({ mode: 'summary' });
    return { requested: snapshot.requestedSource, source: snapshot.source, population: snapshot.population };
  })).toEqual({ requested: 'PALCZEWSKA', source: 'PALCZEWSKA', population: 'OGOLNA' });
  // The real New measurement lifecycle must still hide standalone Summary.
  await loadPatient(page, fixture.ids.a, 'new');
  await settledRestore(page);
  await page.locator('#height').fill('159');
  await page.locator('#weight').fill('47');
  await page.locator('#weight').blur();
  await expect(page.locator('#prevSummaryWrap')).toBeVisible();
  await expect(page.locator('#currentSummaryWrap')).toBeHidden();
  await expect.poll(() => page.evaluate(() => window.VildaSummaryComparison.getState().status)).toBe('ready');
  expect(await page.evaluate(() => window.VildaSummaryTabs.getState().mode)).toBe('dedicated');
  await expect(page.locator('#vildaCentileLiveMount')).toHaveCount(1);
  await expect(page.locator('#vildaSummaryChartPanel #vildaCentileLiveMount')).toHaveCount(0);
});

test('preview doctor policy: standard restore changes only presentation mode after readiness and respects lost access', async ({ page }) => {
  await installWorkspace(page, { enabled: false });
  await createFictionalVault(page);
  const standard = fictionalPatient({ firstName: 'Standardowy', note: 'E2E-LIVE-STANDARD-WORKSPACE' });
  standard.zscore = { resultsMode: false, dataSource: 'OLAF' };
  const id = await page.evaluate(async payload => (await window.VildaVault.savePatient(payload, { dedup: false })).patientId, standard);
  await loadPatient(page, id, 'restore');
  await settledRestore(page);
  await expect(page.locator('#resultsModeToggle')).not.toBeChecked();
  const before = await collect(page);
  expect(before.zscore.resultsMode).toBe(false);
  await page.evaluate(() => {
    window.vildaPersistFlushNow({ force: true });
    sessionStorage.setItem('__homeE2eEnableWorkspace', 'true');
  });
  await page.reload({ waitUntil: 'load' });
  await settledRestore(page);
  await expect(page.locator('#resultsModeToggle')).toBeChecked();
  await expect(page.locator('html')).toHaveClass(/vhome-doctor-results/);
  await expect(page.locator('#resultsModeToggleContainer')).toBeHidden();
  const after = await collect(page);
  expect(after.zscore.resultsMode).toBe(true);
  expect(withoutPresentationMode(after)).toEqual(withoutPresentationMode(before));
  const changes = await page.evaluate(() => window.__homeModeChanges.filter(event => event.checked));
  expect(changes.length).toBeGreaterThan(0);
  expect(changes.every(event => event.access && event.unlocked && event.authReady && !event.restoring)).toBe(true);
  // No readiness helper re-enables PRO: use the actual access module and gate.
  await page.evaluate(() => window.VildaProAccess.setPlan('free'));
  await expect.poll(() => page.evaluate(() => window.VildaProAccess.hasAccess())).toBe(false);
  await expect(page.locator('#resultsModeToggle')).not.toBeChecked();
  await expect(page.locator('#resultsModeToggleContainer')).toBeVisible();
  await expect(page.locator('html')).not.toHaveClass(/vhome-doctor-results/);
  await page.evaluate(() => { window.VildaHomeWorkspace.refresh(); window.VildaHomeWorkspace.refresh(); });
  await expect(page.locator('#resultsModeToggle')).not.toBeChecked();
  expect(await page.evaluate(() => window.professionalMode)).toBe(false);
  await expect(page.locator('#height')).toHaveValue('158');
  await expect(page.locator('#weight')).toHaveValue('46');
});

test('preview copy action honors its native visibility preference even when the dietary section stays available', async ({ page }) => {
  await openWorkspace(page);
  const before = await collect(page);
  await expect(page.locator('#metabolicSummaryBtn')).toBeEnabled();
  await page.evaluate(() => {
    const preferences = window.VildaPersistence.readPreferenceJSON('CARD_VISIBILITY', {});
    window.VildaPersistence.writePreferenceJSON('CARD_VISIBILITY', {
      ...preferences, metabolicSummaryBtn: false, dietRecommendationsBtn: true,
    });
    window.updateMetabolicSummaryVisibility();
  });
  await expect(page.locator('#metabolicSummarySection')).toBeVisible();
  await expect(page.locator('#metabolicSummaryBtn')).toBeHidden();
  expect(await page.locator('#metabolicSummaryBtn').evaluate(button => button.hidden)).toBe(true);
  await expect(page.locator('.vhome-form-actions')).toHaveClass(/vhome-single-action/);
  const single = await page.locator('.vhome-form-actions').evaluate(actions => ({
    columns: getComputedStyle(actions).gridTemplateColumns.trim().split(/\s+/).length,
    buttonWidth: document.getElementById('clearAllDataBtn').getBoundingClientRect().width,
    width: actions.clientWidth,
  }));
  expect(single.columns).toBe(1);
  expect(Math.abs(single.width - single.buttonWidth)).toBeLessThanOrEqual(1);
  expect(await collect(page)).toEqual(before);
  await page.evaluate(() => {
    const preferences = window.VildaPersistence.readPreferenceJSON('CARD_VISIBILITY', {});
    window.VildaPersistence.writePreferenceJSON('CARD_VISIBILITY', { ...preferences, metabolicSummaryBtn: true });
    window.updateMetabolicSummaryVisibility();
  });
  await expect(page.locator('#metabolicSummaryBtn')).toBeVisible();
  await expect(page.locator('#metabolicSummaryBtn')).toBeEnabled();
  await expect(page.locator('.vhome-form-actions')).not.toHaveClass(/vhome-single-action/);
});
