import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';
import { createFictionalVault, fictionalPatient, loadPatient, readyForPatient, shellFrame, NOTE_A } from '../support/centile-live-fixture.mjs';
import { openPatientDocuments, closePatientDocuments, DOCUMENTS_DIALOG } from '../support/patient-documents-ui.mjs';

test.use({ serviceWorkers: 'allow' });
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const resourceNames = [
  'app.js', 'inline_index_04.js',
  'vilda_centile_live_colors.js', 'vilda_summary_tabs.js', 'vilda_summary_cards.js',
  'vilda_professional_summary_rules.js', 'vilda_professional_summary.js', 'vilda_professional_summary.css',
  'vilda_trajectory_analysis.js',
  'vilda_summary_layout.js', 'vilda_patient_documents.js', 'vilda_patient_documents.css',
  'vilda_centile_live_data.js', 'vilda_centile_live_render.js', 'vilda_centile_live_preview.js', 'vilda_centile_live_view.js',
  'vilda_centile_live_host.js', 'vilda_centile_live_panel.js', 'vilda_centile_live_panel.css',
  'vilda_save_feedback.js', 'vilda_save_feedback.css',
  'vilda_html.js', 'vilda_persist_runtime.js', 'vilda_data_import_export.js',
  'vilda_advanced_growth.js', 'growth-basic-module.js', 'vilda_auth_ui.js',
  'docpro_state_persist.js',
  'ds_lms.js', 'vilda_bmi.js', 'vilda_ds_source.js', 'inline_index_05.js', 'inline_docpro_03.js',
];

function resourcesFor(documentName) {
  const html = fs.readFileSync(path.join(root, documentName), 'utf8');
  const urls = [...html.matchAll(/<(?:script|link)\b[^>]*\b(?:src|href)="([^"]+)"[^>]*>/g)].map((match) => match[1]);
  return urls.filter((url) => resourceNames.includes(url.split('?')[0])).map((url) => ({
    url: '/' + url,
    sha256: createHash('sha256').update(fs.readFileSync(path.join(root, url.split('?')[0]))).digest('hex'),
  }));
}

async function startServer() {
  const child = spawn(process.execPath, [path.join(root, 'tests/support/static-server.mjs')], {
    env: { ...process.env, PORT: '0' }, stdio: ['ignore', 'pipe', 'inherit'],
  });
  const origin = await new Promise((resolve, reject) => {
    let output = '';
    child.stdout.on('data', (chunk) => {
      output += chunk;
      const match = /http:\/\/127\.0\.0\.1:(\d+)/.exec(output);
      if (match) resolve(`http://127.0.0.1:${match[1]}`);
    });
    child.once('error', reject);
    child.once('exit', (code) => reject(new Error(`Offline test server exited before startup: ${code}`)));
  });
  return { origin, stop: () => new Promise((resolve) => {
    if (child.exitCode !== null || child.signalCode !== null) { resolve(); return; }
    child.once('exit', resolve); child.kill('SIGKILL');
  }) };
}

async function installProductionWorker(page, origin) {
  // Do not warm any feature document in the page or browser HTTP cache.
  await page.goto(`${origin}/tests/fixtures/service-worker-runner.html`);
  const state = await page.evaluate(async () => {
    const registration = await navigator.serviceWorker.register('/service-worker-kalorii.js', { scope: '/' });
    const worker = registration.installing || registration.waiting || registration.active;
    const done = () => ['activated', 'redundant'].includes(worker.state);
    if (!done()) await new Promise((resolve) => {
      worker.addEventListener('statechange', () => { if (done()) resolve(); });
    });
    return worker.state;
  });
  expect(state, 'unmodified production worker activates before shutting down the origin').toBe('activated');
}

async function assertOfflineResources(page, resources, responses) {
  for (const resource of resources) {
    expect(responses.get(resource.url), `${resource.url}: served by the production SW after browser restart`).toBe(true);
    const hash = await page.evaluate(async (url) => {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`Missing cached module ${url}: ${response.status}`);
      const digest = await crypto.subtle.digest('SHA-256', await response.arrayBuffer());
      return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
    }, resource.url);
    expect(hash, `${resource.url}: offline bytes equal current source`).toBe(resource.sha256);
  }
}

async function assertPanelAndFullscreen(page, frame, patientId) {
  try {
    await loadPatient(frame, patientId, 'new', { clear: true });
  } catch (error) {
    const diagnostics = await frame.evaluate(() => ({
      path: location.pathname, intakeHistory: window.intakeHistory,
      intakeEstimatedKcalPerDay: window.intakeEstimatedKcalPerDay,
      collectedIntake: window.collectUserData?.().estimatedIntake,
      panel: window.VildaCentileLivePanel?.getState(),
      clearUntil: window.__vildaPersistClearUntil, now: Date.now(),
      restoring: window.__vildaPersistRestoring, mirroring: window.__vildaLustroWpis,
    }));
    await test.info().attach('offline-new-measurement-state.json', {
      body: JSON.stringify(diagnostics, null, 2), contentType: 'application/json',
    });
    throw error;
  }
  await expect.poll(() => frame.evaluate(() => window.VildaCentileLivePanel?.getState()), { timeout: 30_000 })
    .toMatchObject({ eligible: true, status: 'ready', patientId, source: 'OLAF' });
  await expect(frame.locator('svg.vilda-centile-live-preview')).toBeVisible();
  await expect(frame.locator('canvas.vilda-centile-live-full-background')).toHaveCount(0);
  await frame.locator('.vilda-centile-live-expand').click();
  const dialog = page.locator('.vilda-centile-live-dialog');
  await expect(dialog).toBeVisible();
  await expect.poll(() => frame.evaluate((note) => window.__siatkaE2eTexts?.some((text) => text.includes(note)), NOTE_A))
    .toBe(true);
  expect(await dialog.evaluate((element) => element.ownerDocument === document)).toBe(true);
  if (frame !== page) await expect(frame.locator('.vilda-centile-live-dialog')).toHaveCount(0);
  await dialog.locator('[data-centile-live-metric="both"]').click();
  await expect(dialog.locator('.vilda-centile-live-image:visible')).toHaveCount(2);
  await dialog.locator('.vilda-centile-live-interaction').first().focus();
  await page.keyboard.press('ArrowRight');
  await expect.poll(() => frame.evaluate(() => window.VildaCentileLivePanel.getState()))
    .toMatchObject({ metric: 'both', fullscreen: true, pinned: true });
  await dialog.locator('.vilda-centile-live-close').click();
  await expect(dialog).toHaveCount(0);
  await expect(frame.locator('svg.vilda-centile-live-preview')).toBeVisible();
  await expect(frame.locator('canvas.vilda-centile-live-full-background')).toHaveCount(0);
  // New measurement deliberately starts with empty weight/height. Supply the
  // synthetic visit before testing a successful offline save of that visit.
  await frame.locator('#weight').fill('47');
  await frame.locator('#height').fill('159');
  await frame.evaluate(() => window.saveUserData());
  await expect(page.locator('#vildaSaveFeedback[data-state="saved"]')).toBeVisible();
  await expect(frame.locator('.vilda-centile-live-card')).toBeVisible();
  if (frame !== page) await expect(frame.locator('#vildaSaveFeedback')).toHaveCount(0);
}

async function assertSummaryOffline(frame, patientId) {
  await loadPatient(frame, patientId, 'restore', { clear: true });
  const card = frame.locator('#currentSummaryCard');
  await expect(card).toBeVisible();
  await expect(card.locator('.professional-summary-chip')).toHaveCount(0);
  await expect(card.locator('.pro-summary-label')).toBeHidden();
  const main = card.locator('.professional-summary-main');
  await expect(main.locator('[data-summary-key]')).toHaveCount(10);
  const prediction = main.locator('[data-summary-key="prediction"]');
  await expect(prediction).toHaveAttribute('data-reference-age-months', '216');
  await expect(prediction.locator('.professional-summary-reference')).toContainText(/centyl.*18 lat/);
  expect(Number(await prediction.getAttribute('data-reference-percentile'))).toBeGreaterThan(0);
  expect(await main.locator('[data-summary-key="bsa"]').evaluate(el => getComputedStyle(el).color)).toBe('rgb(38, 63, 69)');
  await expect(main.locator('[data-summary-key="velocity-sds"]')).not.toHaveAttribute('data-assessment', 'unassessed');
  const data = await frame.evaluate(() => window.VildaSummaryCards.getAssessmentData());
  expect(Number.isFinite(data.velocity.sds)).toBe(true);
  expect(data.predictions.some(item => Number.isFinite(item.cm))).toBe(true);
  await frame.getByRole('tab', { name: 'Siatka centylowa', exact: true }).click();
  await expect(frame.locator('#vildaSummaryChartPanel svg.vilda-centile-live-preview')).toBeVisible();
}

async function assertDocumentsOffline(page, frame) {
  await openPatientDocuments(page);
  const dialog = page.locator(DOCUMENTS_DIALOG);
  await expect(dialog.locator('input[name="patientReportPdfChoice"]')).toHaveCount(4);
  const native = await frame.evaluate(() => window.patientReportGetPdfChoiceOptions().map(option => option.value));
  expect(await dialog.locator('input[name="patientReportPdfChoice"]:enabled')
    .evaluateAll(inputs => inputs.map(input => input.value))).toEqual(native);
  expect(native).toContain('visit');
  expect(native).toContain('growth');
  await expect(dialog.locator('[data-patient-documents-copy]')).toBeEnabled();
  if (frame !== page) await expect(frame.locator(DOCUMENTS_DIALOG)).toHaveCount(0);
  await closePatientDocuments(page);
}

async function assertZemelOffline(page, frame, patientId) {
  await loadPatient(frame, patientId, 'restore', { clear: true });
  await frame.getByRole('tab', { name: 'Siatka centylowa', exact: true }).click();
  await expect(frame.locator('svg.vilda-centile-live-preview')).toHaveAttribute('data-source', 'DS', { timeout: 30_000 });
  await expect(frame.locator('.vilda-centile-live-source').first()).toContainText('Zemel 2015');
  const reading = await frame.evaluate(async () => {
    const snapshot = await window.VildaCentileLiveData.getSnapshot({ mode: 'summary' });
    const preview = window.VildaCentileLiveRender.preview(snapshot);
    const point = preview.height.points.at(-1);
    const probe = preview.height.probe(point.ageMonths);
    const native = window.getCentilePercentileStatsForSource(point.value, snapshot.sex, point.clinicalAgeMonths,
      'HT', 'DS', { population: 'DS' });
    return { source: snapshot.source, population: snapshot.population, probe, native };
  });
  expect(reading).toMatchObject({ source: 'DS', population: 'DS', probe: { source: 'DS' } });
  expect(reading.probe.percentile).toBeCloseTo(reading.native.percentile, 10);
  await frame.locator('.vilda-centile-live-expand').click();
  const dialog = page.locator('.vilda-centile-live-dialog');
  await expect(dialog).toBeVisible();
  await expect(dialog.locator('.vilda-centile-live-source')).toContainText('Zemel 2015');
  await dialog.locator('[data-centile-live-metric="both"]').click();
  await expect(dialog.locator('svg.vilda-centile-live-full-svg[data-source="DS"]:visible')).toHaveCount(2);
  await expect(dialog.locator('.vilda-centile-live-mph:visible')).toHaveCount(0);
  await dialog.locator('.vilda-centile-live-close').click();
}

// Real installation + cold browser restart + stopped origin. The first visits to
// index/DocPro/app all happen offline, with a real encrypted, purely fictional vault.
test('new centile modules, annotated canvases and parent fullscreen survive a cold offline restart', async ({ playwright, browserName, launchOptions }) => {
  test.setTimeout(240_000);
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'vilda-centile-live-offline-'));
  const server = await startServer();
  const launch = () => playwright[browserName].launchPersistentContext(profile, {
    ...launchOptions, serviceWorkers: 'allow', baseURL: server.origin, locale: 'pl-PL',
    timezoneId: 'Europe/Warsaw', viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce',
  });
  let context;
  try {
    context = await launch();
    context.setDefaultTimeout(30_000);
    const installer = context.pages()[0] || await context.newPage();
    await test.step('install the complete production SW before visiting clinical pages', () => installProductionWorker(installer, server.origin));
    await context.close(); context = null;
    await server.stop();
    context = await launch();
    context.setDefaultTimeout(30_000);
    const page = context.pages()[0] || await context.newPage();
    const responses = new Map();
    page.on('response', (response) => {
      const url = new URL(response.url());
      if (url.origin === server.origin) responses.set(url.pathname + url.search, response.fromServiceWorker());
    });
    const { ids } = await test.step('cold-start index offline and create a purely fictional encrypted vault', () => createFictionalVault(page));
    const dsId = await page.evaluate(async record => {
      record.clinical = { downSyndrome: true };
      return (await window.VildaVault.savePatient(record, { dedup: false })).patientId;
    }, fictionalPatient({ firstName: 'ZemelOffline', sex: 'F', age: 12, height: 140, weight: 40 }));
    expect(await page.evaluate(() => fetch(`/__centile-offline-probe-${Date.now()}`).then(() => false, () => true)),
      'origin is really stopped, not merely an emulated cached response').toBe(true);
    const indexResources = resourcesFor('index.html');
    expect(indexResources.map((entry) => entry.url.split('?')[0].slice(1)).sort())
      .toEqual(resourceNames.filter((name) => !['docpro_state_persist.js', 'inline_docpro_03.js'].includes(name)).sort());
    await assertOfflineResources(page, indexResources, responses);
    await test.step('index offline: summary B includes typed velocity SDS and 18-year prediction assessment', () => assertSummaryOffline(page, ids.a));
    await test.step('index offline: annotated panel, both charts and fullscreen', () => assertPanelAndFullscreen(page, page, ids.a));
    await test.step('index offline: sidebar documents load the native reports on demand', () => assertDocumentsOffline(page, page));
    await test.step('index offline: Zemel preview and both full charts reuse cached DS data', () => assertZemelOffline(page, page, dsId));

    responses.clear();
    await page.goto('/docpro.html', { waitUntil: 'load' });
    await readyForPatient(page);
    const confirmation = page.locator('#professionalConfirmBtn');
    if (await confirmation.isVisible()) await confirmation.click();
    const docproResources = resourcesFor('docpro.html');
    expect(docproResources.map((entry) => entry.url.split('?')[0].slice(1)).sort())
      .toEqual(resourceNames.filter((name) => !['growth-basic-module.js', 'inline_index_05.js'].includes(name)).sort());
    await assertOfflineResources(page, docproResources, responses);
    await test.step('DocPro offline: annotated panel, both charts and fullscreen', () => assertPanelAndFullscreen(page, page, ids.a));
    await test.step('DocPro offline: native documents remain available', () => assertDocumentsOffline(page, page));
    await test.step('DocPro offline: Zemel preview and both full charts reuse cached DS data', () => assertZemelOffline(page, page, dsId));

    responses.clear();
    await page.goto('/app.html#/start', { waitUntil: 'load' });
    const frame = await shellFrame(page);
    await readyForPatient(frame);
    const shellResources = resourcesFor('app.html');
    expect(shellResources.map((entry) => entry.url.split('?')[0].slice(1)).sort())
      .toEqual(['vilda_auth_ui.js', 'vilda_bmi.js', 'vilda_centile_live_host.js', 'vilda_centile_live_panel.css', 'vilda_html.js', 'vilda_patient_documents.css', 'vilda_save_feedback.css', 'vilda_save_feedback.js', 'vilda_trajectory_analysis.js']);
    await assertOfflineResources(page, shellResources, responses);
    await test.step('app shell offline: fullscreen covers the parent viewport', () => assertPanelAndFullscreen(page, frame, ids.a));
    await test.step('app shell offline: documents cover the parent viewport', () => assertDocumentsOffline(page, frame));
    expect(await page.evaluate(() => new URL(navigator.serviceWorker.controller.scriptURL).pathname)).toBe('/service-worker-kalorii.js');
  } finally {
    if (context) await context.close().catch(() => {});
    await server.stop();
    fs.rmSync(profile, { recursive: true, force: true });
  }
});
