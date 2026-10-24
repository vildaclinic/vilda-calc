import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';
import {
  initializeStorage, ready, setCurrentPatient, choose, setQuickAge,
  expectMedian, expectNoMedian, geometry, patientPoint, sources,
} from '../support/female-tt-age.mjs';

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
    process.once('exit', code => reject(new Error(`Female TT offline server exited before startup (${code})`)));
  });
  const stop = () => new Promise(resolve => {
    if (process.exitCode !== null || process.signalCode !== null) { resolve(); return; }
    process.once('exit', resolve);
    process.kill('SIGKILL');
  });
  return { origin, stop };
}

test('production SW upgrades and supplies female TT after a cold browser restart with the origin server stopped', async ({ playwright, browserName, launchOptions }) => {
  test.setTimeout(240_000);
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'vilda-female-tt-age-offline-'));
  const server = await startServer();
  let context;
  try {
    const options = { ...launchOptions, serviceWorkers: 'allow', locale: 'pl-PL' };
    context = await playwright[browserName].launchPersistentContext(profile, options);
    const installer = context.pages()[0] || await context.newPage();
    await initializeStorage(installer);
    await installer.goto(`${server.origin}/tests/fixtures/service-worker-runner.html`);
    const previous = await installer.evaluate(async () => {
      const registration = await navigator.serviceWorker.register('/__test-service-worker-kalorii.js?wersja=female-tt-prior', { scope: '/' });
      const worker = registration.installing || registration.waiting || registration.active;
      if (!['activated', 'redundant'].includes(worker.state)) await new Promise(resolve => {
        worker.addEventListener('statechange', () => {
          if (['activated', 'redundant'].includes(worker.state)) resolve();
        });
      });
      return { state: worker.state,
        converter: Boolean(await caches.match('/przelicznik-jednostek.html')),
        reader: Boolean(await caches.match('/vilda_female_tt_age.js', { ignoreSearch: true })),
        data: Boolean(await caches.match('/vilda_hormone_lifespan_data.js', { ignoreSearch: true })),
      };
    });
    expect(previous).toEqual({ state: 'activated', converter: false, reader: false, data: false });
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
    await context.close();
    context = null;
    await server.stop();

    // A new browser process leaves only the persisted SW/cache. No retained
    // page globals, HTTP server or network-assisted service-worker request can
    // supply the converter, new evaluator/UI, stylesheet, or source bundle.
    context = await playwright[browserName].launchPersistentContext(profile, options);
    const page = context.pages()[0] || await context.newPage();
    await initializeStorage(page);
    const errors = [], failures = [], authoringRequests = [], fromWorker = new Set();
    page.on('pageerror', error => errors.push(error.message));
    page.on('request', request => {
      if (/\/female-tt-age-(data|policy)\.json(?:\?|$)/.test(request.url())) authoringRequests.push(request.url());
    });
    page.on('requestfailed', request => {
      const url = new URL(request.url());
      if (url.origin !== server.origin || url.searchParams.has('female-tt-offline-probe')) return;
      if (request.failure()?.errorText === 'net::ERR_ABORTED') return;
      failures.push(`${url.pathname}${url.search}: ${request.failure()?.errorText}`);
    });
    page.on('response', response => {
      if (response.fromServiceWorker()) fromWorker.add(new URL(response.url()).pathname);
    });
    await page.goto(`${server.origin}/przelicznik-jednostek.html`, { waitUntil: 'load' });
    await ready(page);
    expect(await page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true);
    const probe = () => page.evaluate(() => fetch(`/README.md?female-tt-offline-probe=${Date.now()}`)
      .then(() => 'network', () => 'offline'));
    expect(await probe(), 'the origin server has actually stopped').toBe('offline');
    await setCurrentPatient(page, { age: 12, months: 0 });
    await choose(page);
    await expectMedian(page);
    await expect(patientPoint(page)).toHaveCount(1);
    await expect(sources(page)).not.toHaveAttribute('open');
    const original = await geometry(page);
    for (const [age, months, value] of [[12, 6, .4874143269614546], [17, '', .8313584790221047],
      [18, '', null], [3, '', null], [75, '', null], [12, 0, .42502815745885664]]) {
      await setQuickAge(page, age, months);
      if (value == null) await expectNoMedian(page);
      else {
        await expectMedian(page, value);
        expect(await geometry(page)).toEqual(original);
      }
    }
    await page.locator('#labValue').fill('<0.1');
    await expectMedian(page);
    await expect(patientPoint(page)).toHaveCount(0);
    await page.reload({ waitUntil: 'load' });
    await ready(page);
    await choose(page);
    await setQuickAge(page, 12, 6);
    await expectMedian(page, .4874143269614546);
    await page.locator('#labUnitTarget').selectOption('ng/dL');
    await expectMedian(page, .4874143269614546);
    await expect(patientPoint(page)).toHaveCount(1);
    for (const resource of ['/vilda_female_tt_age.js', '/vilda_female_tt_age_ui.js',
      '/vilda_female_tt_age_ui.css', '/vilda_hormone_lifespan_data.js']) {
      expect(fromWorker.has(resource), `${resource} delivered by the production SW`).toBe(true);
    }
    expect(authoringRequests, 'source data/policy are in the packaged runtime, without uncached authoring requests').toEqual([]);
    expect(await probe(), 'the origin is still absent after edits and reload').toBe('offline');
    expect(failures, 'all same-origin application resources are available without the origin server').toEqual([]);
    expect(errors).toEqual([]);
  } finally {
    await server.stop();
    if (context) await context.close();
    fs.rmSync(profile, { recursive: true, force: true });
  }
});
