import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';
import {
  initializeStorage, ready, setCurrentPatient, choose, setQuickAge,
  expectAdultMedian, expectChildMedian, expectNoMedian, expectNoPatientPoint,
  patientPoint, sources, plotGeometry, expectSameGeometry,
} from '../support/male-e2-adult-age.mjs';

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
    process.once('exit', code => reject(new Error(`Adult E2 offline server exited before startup (${code})`)));
  });
  const stop = () => new Promise(resolve => {
    if (process.exitCode !== null || process.signalCode !== null) { resolve(); return; }
    process.once('exit', resolve);
    process.kill('SIGKILL');
  });
  return { origin, stop };
}

test('production SW upgrades and supplies adult and pediatric male E2 after a cold offline browser restart', async ({ playwright, browserName, launchOptions }) => {
  test.setTimeout(240_000);
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'vilda-adult-male-e2-offline-'));
  const server = await startServer();
  const source = fs.readFileSync(path.join(root, 'service-worker-kalorii.js'), 'utf8');
  const version = /const SW_VERSION = '([^']+)';/.exec(source)?.[1];
  expect(version, 'test reads the current production SW, without a frozen version pin').toBeTruthy();
  let context;
  try {
    const options = { ...launchOptions, serviceWorkers: 'allow', locale: 'pl-PL' };
    context = await playwright[browserName].launchPersistentContext(profile, options);
    const installer = context.pages()[0] || await context.newPage();
    await initializeStorage(installer);
    await installer.goto(`${server.origin}/tests/fixtures/service-worker-runner.html`);
    const previous = await installer.evaluate(async () => {
      const registration = await navigator.serviceWorker.register('/__test-service-worker-kalorii.js?wersja=adult-e2-prior', { scope: '/' });
      const worker = registration.installing || registration.waiting || registration.active;
      if (!['activated', 'redundant'].includes(worker.state)) await new Promise(resolve => {
        worker.addEventListener('statechange', () => {
          if (['activated', 'redundant'].includes(worker.state)) resolve();
        });
      });
      return { state: worker.state,
        converter: Boolean(await caches.match('/przelicznik-jednostek.html')),
        reader: Boolean(await caches.match('/vilda_male_e2_age.js', { ignoreSearch: true })),
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
      return { state: worker.state, url: worker.scriptURL, cacheNames: await caches.keys() };
    });
    expect(installed.state).toBe('activated');
    expect(installed.url).toBe(`${server.origin}/service-worker-kalorii.js`);
    expect(installed.cacheNames).toContain(`pwa-kalorii-shell-v${version}`);
    await context.close();
    context = null;
    await server.stop();

    // A separate process can use only persisted production SW/cache. The HTTP
    // server is absent before any converter page or new age model is loaded.
    context = await playwright[browserName].launchPersistentContext(profile, options);
    const page = context.pages()[0] || await context.newPage();
    await initializeStorage(page);
    const errors = [], failures = [], authoringRequests = [], fromWorker = new Set();
    page.on('pageerror', error => errors.push(error.message));
    page.on('request', request => {
      if (/\/male-e2(?:-adult)?-age-(data|policy)\.json(?:\?|$)/.test(request.url())) authoringRequests.push(request.url());
    });
    page.on('requestfailed', request => {
      const url = new URL(request.url());
      if (url.origin !== server.origin || url.searchParams.has('adult-e2-origin-probe')) return;
      if (request.failure()?.errorText === 'net::ERR_ABORTED') return;
      failures.push(`${url.pathname}${url.search}: ${request.failure()?.errorText}`);
    });
    page.on('response', response => {
      if (response.fromServiceWorker()) fromWorker.add(new URL(response.url()).pathname);
    });
    await page.goto(`${server.origin}/przelicznik-jednostek.html`, { waitUntil: 'load' });
    await ready(page);
    expect(await page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true);
    const probe = () => page.evaluate(() => fetch(`/README.md?adult-e2-origin-probe=${Date.now()}`)
      .then(() => 'network', () => 'offline'));
    expect(await probe(), 'the origin is actually stopped').toBe('offline');
    await setCurrentPatient(page, { age: 40, months: '' });
    await choose(page, '125');
    await expectAdultMedian(page);
    await expect(patientPoint(page)).toHaveAttribute('data-source-value', '125');
    await expect(page.locator('#labResultStatus')).toContainText('w zakresie normy');
    await expect(sources(page)).not.toHaveAttribute('open');
    const original = await plotGeometry(page);
    await page.locator('#labUnitTarget').selectOption('pg/mL');
    await expectAdultMedian(page);
    expectSameGeometry(await plotGeometry(page), original);
    await expect(patientPoint(page)).toHaveAttribute('data-source-value', '125');
    await page.locator('#labUnitTarget').selectOption('pmol/L');
    for (const [age, months, expected] of [[31, 4, null], [31, 5, 89.47239229264481],
      [60, '', null], [60, 9, 87.38540878379439], [60, 10, null], [25, '', null], [75, '', null], [40, '', 88.16623312463493]]) {
      await setQuickAge(page, age, months);
      if (expected == null) await expectNoMedian(page);
      else {
        await expectAdultMedian(page, expected);
        expectSameGeometry(await plotGeometry(page), original);
      }
    }
    await setQuickAge(page, 12, 0);
    await expectChildMedian(page);
    await setQuickAge(page, 6, 0);
    await page.locator('#labValue').fill('0.4');
    await expectChildMedian(page, .24701013272002922);
    await expect(patientPoint(page)).toHaveAttribute('data-source-value', '0.4');
    await setQuickAge(page, 40, '');
    await page.locator('#labValue').fill('<5');
    await expectAdultMedian(page);
    await expectNoPatientPoint(page);
    await page.locator('#labValue').fill('<LOQ');
    await expectAdultMedian(page);
    await expectNoPatientPoint(page);
    await page.reload({ waitUntil: 'load' });
    await ready(page);
    await choose(page, '125');
    await setQuickAge(page, 40, '');
    await expectAdultMedian(page);
    await expect(patientPoint(page)).toHaveAttribute('data-source-value', '125');
    for (const resource of ['/vilda_male_e2_age.js', '/vilda_male_e2_age_ui.js',
      '/vilda_male_e2_age_ui.css', '/vilda_hormone_lifespan_data.js']) {
      expect(fromWorker.has(resource), `${resource} delivered by current production SW`).toBe(true);
    }
    expect(authoringRequests, 'both source datasets are compiled into the cached runtime').toEqual([]);
    expect(await probe(), 'origin remains absent after source changes and reload').toBe('offline');
    expect(failures, 'all same-origin application resources work without the origin').toEqual([]);
    expect(errors).toEqual([]);
  } finally {
    await server.stop();
    if (context) await context.close();
    fs.rmSync(profile, { recursive: true, force: true });
  }
});
