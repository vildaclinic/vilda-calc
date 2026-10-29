import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';
import {
  initializeStorage, ready, start, mainPatient, choose, card, rows, patientPoint,
  sources, supplyReportedSample, expectUpper, expectNoPatientPoint, expectFits,
} from '../support/female-tt-infant-upper.mjs';

test.use({ serviceWorkers: 'allow', reducedMotion: 'reduce' });
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

async function startServer() {
  const process = spawn(globalThis.process.execPath, [path.join(root, 'tests/support/static-server.mjs')], {
    env: { ...globalThis.process.env, PORT: '0' }, stdio: ['ignore', 'pipe', 'inherit'],
  });
  const origin = await new Promise((resolve, reject) => {
    let output = '';
    process.stdout.on('data', chunk => {
      output += chunk;
      const match = /http:\/\/127\.0\.0\.1:\d+/.exec(output);
      if (match) resolve(match[0]);
    });
    process.once('error', reject);
    process.once('exit', code => reject(new Error(`Infant female TT offline server exited before startup (${code})`)));
  });
  const stop = () => new Promise(resolve => {
    if (process.exitCode !== null || process.signalCode !== null) { resolve(); return; }
    process.once('exit', resolve);
    process.kill('SIGKILL');
  });
  return { origin, stop };
}

test('production SW update and cold offline restart retain infant TT source-only and qualified module rendering', async ({ playwright, browserName, launchOptions }) => {
  test.setTimeout(240_000);
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'vilda-female-tt-infant-upper-offline-'));
  const server = await startServer();
  let context;
  try {
    const options = { ...launchOptions, serviceWorkers: 'allow', locale: 'pl-PL', viewport: { width: 320, height: 1000 } };
    context = await playwright[browserName].launchPersistentContext(profile, options);
    const installer = context.pages()[0] || await context.newPage();
    await initializeStorage(installer);
    await installer.goto(`${server.origin}/tests/fixtures/service-worker-runner.html`);
    const previous = await installer.evaluate(async () => {
      const registration = await navigator.serviceWorker.register('/__test-service-worker-kalorii.js?wersja=female-tt-infant-upper-prior', { scope: '/' });
      const worker = registration.installing || registration.waiting || registration.active;
      if (!['activated', 'redundant'].includes(worker.state)) await new Promise(resolve => {
        worker.addEventListener('statechange', () => {
          if (['activated', 'redundant'].includes(worker.state)) resolve();
        });
      });
      return { state: worker.state,
        converter: Boolean(await caches.match('/przelicznik-jednostek.html')),
        evaluator: Boolean(await caches.match('/vilda_female_tt_infant_upper.js', { ignoreSearch: true })),
      };
    });
    expect(previous).toEqual({ state: 'activated', converter: false, evaluator: false });
    const installed = await installer.evaluate(async () => {
      const registration = await navigator.serviceWorker.register('/service-worker-kalorii.js', { scope: '/' });
      const worker = registration.installing || registration.waiting || registration.active;
      if (worker.state === 'installed') worker.postMessage({ type: 'SKIP_WAITING' });
      if (!['activated', 'redundant'].includes(worker.state)) await new Promise(resolve => {
        worker.addEventListener('statechange', () => {
          if (worker.state === 'installed') worker.postMessage({ type: 'SKIP_WAITING' });
          if (['activated', 'redundant'].includes(worker.state)) resolve();
        });
      });
      return { state: worker.state, url: worker.scriptURL };
    });
    expect(installed).toEqual({ state: 'activated', url: `${server.origin}/service-worker-kalorii.js` });
    await context.close(); context = null;
    await server.stop();

    // Only the persisted production SW/cache survives. Neither live page
    // globals nor the origin server can supply the new evaluator/UI/data.
    context = await playwright[browserName].launchPersistentContext(profile, options);
    const page = context.pages()[0] || await context.newPage();
    const errors = [], failures = [], authoringRequests = [], fromWorker = new Set();
    page.on('pageerror', error => errors.push(error.message));
    page.on('request', request => {
      if (/\/female-tt-infant-upper-(data|policy)\.json(?:\?|$)/.test(request.url())) authoringRequests.push(request.url());
    });
    page.on('requestfailed', request => {
      const url = new URL(request.url());
      if (url.origin !== server.origin || url.searchParams.has('female-tt-infant-offline-probe')) return;
      if (request.failure()?.errorText === 'net::ERR_ABORTED') return;
      failures.push(`${url.pathname}${url.search}: ${request.failure()?.errorText}`);
    });
    page.on('response', response => {
      if (response.fromServiceWorker()) fromWorker.add(new URL(response.url()).pathname);
    });
    await start(page, { origin: server.origin, offline: true, width: 320 });
    expect(await page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true);
    const probe = () => page.evaluate(() => fetch(`/README.md?female-tt-infant-offline-probe=${Date.now()}`)
      .then(() => 'network', () => 'offline'));
    expect(await probe(), 'the origin server has actually stopped').toBe('offline');
    await mainPatient(page, { origin: server.origin });
    await choose(page);
    await expectUpper(page, .21, 'source-info');
    await expectNoPatientPoint(page);
    await expect(sources(page)).not.toHaveAttribute('open');
    await supplyReportedSample(page);
    await expectUpper(page);
    await expect(patientPoint(page)).toHaveAttribute('data-source-value', '0.15');
    await page.locator('#labValue').fill('>0,21');
    await supplyReportedSample(page);
    await expect(page.locator('#labResultStatus')).toContainText('Powyżej górnej wartości odniesienia');
    await expectNoPatientPoint(page);
    await page.locator('#labUnitTarget').selectOption('ng/mL');
    await supplyReportedSample(page);
    await expect(rows(page).locator('strong')).toHaveText('0,061');
    await expectNoPatientPoint(page);
    await expectFits(page);
    await page.reload({ waitUntil: 'load' });
    await ready(page);
    await choose(page);
    await expectUpper(page, .21, 'source-info');
    await expectNoPatientPoint(page);
    await expect(card(page).locator('input, select, textarea')).toHaveCount(0);
    for (const resource of ['/vilda_female_tt_infant_upper.js', '/vilda_female_tt_infant_upper_ui.js',
      '/vilda_female_tt_infant_upper_ui.css', '/vilda_hormone_lifespan_data.js']) {
      expect(fromWorker.has(resource), `${resource} delivered by the production SW`).toBe(true);
    }
    expect(authoringRequests, 'source data/policy are packaged without uncached authoring requests').toEqual([]);
    expect(await probe(), 'the origin remains absent after current-form edits and reload').toBe('offline');
    expect(failures, 'all same-origin application resources are cached').toEqual([]);
    expect(errors).toEqual([]);
  } finally {
    await server.stop();
    if (context) await context.close();
    fs.rmSync(profile, { recursive: true, force: true });
  }
});
