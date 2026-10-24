import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';
import { createFictionalVault, loadPatient, readyForPatient, shellFrame, NOTE_A } from '../support/centile-live-fixture.mjs';

test.use({ serviceWorkers: 'allow' });
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const resourceNames = [
  'vilda_centile_live_data.js', 'vilda_centile_live_render.js', 'vilda_centile_live_view.js',
  'vilda_centile_live_host.js', 'vilda_centile_live_panel.js', 'vilda_centile_live_panel.css',
  'vilda_save_feedback.js', 'vilda_save_feedback.css',
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
  await expect.poll(() => frame.evaluate((note) => window.__siatkaE2eTexts?.some((text) => text.includes(note)), NOTE_A))
    .toBe(true);
  await frame.locator('.vilda-centile-live-expand').click();
  const dialog = page.locator('.vilda-centile-live-dialog');
  await expect(dialog).toBeVisible();
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
  await expect(frame.locator('.vilda-centile-live-card')).toBeVisible();
  await frame.evaluate(() => window.saveUserData());
  await expect(page.locator('#vildaSaveFeedback[data-state="saved"]')).toBeVisible();
  await expect(frame.locator('.vilda-centile-live-card')).toBeVisible();
  if (frame !== page) await expect(frame.locator('#vildaSaveFeedback')).toHaveCount(0);
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
    expect(await page.evaluate(() => fetch(`/__centile-offline-probe-${Date.now()}`).then(() => false, () => true)),
      'origin is really stopped, not merely an emulated cached response').toBe(true);
    const indexResources = resourcesFor('index.html');
    expect(indexResources.map((entry) => entry.url.split('?')[0].slice(1)).sort()).toEqual([...resourceNames].sort());
    await assertOfflineResources(page, indexResources, responses);
    await test.step('index offline: annotated panel, both charts and fullscreen', () => assertPanelAndFullscreen(page, page, ids.a));

    responses.clear();
    await page.goto('/docpro.html', { waitUntil: 'load' });
    await readyForPatient(page);
    const confirmation = page.locator('#professionalConfirmBtn');
    if (await confirmation.isVisible()) await confirmation.click();
    await assertOfflineResources(page, resourcesFor('docpro.html'), responses);
    await test.step('DocPro offline: annotated panel, both charts and fullscreen', () => assertPanelAndFullscreen(page, page, ids.a));

    responses.clear();
    await page.goto('/app.html#/start', { waitUntil: 'load' });
    const frame = await shellFrame(page);
    await readyForPatient(frame);
    const shellResources = resourcesFor('app.html');
    expect(shellResources.map((entry) => entry.url.split('?')[0].slice(1)).sort())
      .toEqual(['vilda_centile_live_host.js', 'vilda_centile_live_panel.css', 'vilda_save_feedback.css', 'vilda_save_feedback.js']);
    await assertOfflineResources(page, shellResources, responses);
    await test.step('app shell offline: fullscreen covers the parent viewport', () => assertPanelAndFullscreen(page, frame, ids.a));
    expect(await page.evaluate(() => new URL(navigator.serviceWorker.controller.scriptURL).pathname)).toBe('/service-worker-kalorii.js');
  } finally {
    if (context) await context.close().catch(() => {});
    await server.stop();
    fs.rmSync(profile, { recursive: true, force: true });
  }
});
