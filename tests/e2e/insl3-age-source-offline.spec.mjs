import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';
import {
  initializeStorage, awaitConverter, setCurrentPatient, chooseLh, selectInsl3,
  openSources, source, sources, expectValue, setQuickAge, expectUnavailable,
  geometry, expectNoInsl3Point,
} from '../support/insl3-age-source.mjs';

test.use({ serviceWorkers: 'allow', reducedMotion: 'reduce' });
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

// The same real-network cutoff as pwa-strony-offline.spec.mjs. In Chromium,
// context.setOffline alone has previously left SW fetches able to reach the
// server. This isolated fixture is stopped before the converter's first visit.
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
    process.once('exit', code => reject(new Error(`INSL3 offline server exited before startup (${code})`)));
  });
  const stop = () => new Promise(resolve => {
    if (process.exitCode !== null || process.signalCode !== null) { resolve(); return; }
    process.once('exit', resolve);
    process.kill('SIGKILL');
  });
  return { origin, stop };
}

test('production SW upgrade precaches INSL3 for a genuine cold start and age edits without a network', async ({ playwright, browserName, launchOptions }) => {
  test.setTimeout(240_000);
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'vilda-insl3-offline-'));
  const server = await startServer();
  let context;
  try {
    const options = { ...launchOptions, serviceWorkers: 'allow', locale: 'pl-PL' };
    context = await playwright[browserName].launchPersistentContext(profile, options);
    const installer = context.pages()[0] || await context.newPage();
    await initializeStorage(installer);
    // Compose the repository's small versioned-SW migration fixture with a
    // complete production install. The prior worker has only the basic shell;
    // neither the converter nor these new resources can be inherited from it.
    await installer.goto(`${server.origin}/tests/fixtures/service-worker-runner.html`);
    const previous = await installer.evaluate(async () => {
      const registration = await navigator.serviceWorker.register('/__test-service-worker-kalorii.js?wersja=insl3-prior-source', { scope: '/' });
      const worker = registration.installing || registration.waiting || registration.active;
      if (!['activated', 'redundant'].includes(worker.state)) await new Promise(resolve => {
        worker.addEventListener('statechange', () => {
          if (['activated', 'redundant'].includes(worker.state)) resolve();
        });
      });
      return {
        state: worker.state,
        converterCached: Boolean(await caches.match('/przelicznik-jednostek.html')),
        readerCached: Boolean(await caches.match('/vilda_insl3_age_source.js', { ignoreSearch: true })),
        dataRuntimeCached: Boolean(await caches.match('/vilda_hormone_lifespan_data.js', { ignoreSearch: true })),
      };
    });
    expect(previous).toEqual({ state: 'activated', converterCached: false, readerCached: false, dataRuntimeCached: false });
    // The new worker itself is the unmodified production file with its complete
    // precache. Do not hardcode its current SW_VERSION or trim the new assets.
    const installed = await installer.evaluate(async () => {
      const registration = await navigator.serviceWorker.register('/service-worker-kalorii.js', { scope: '/' });
      const worker = registration.installing || registration.waiting || registration.active;
      // Match the app's explicit update action: the old controlled runner must
      // release the waiting new worker instead of blocking activation forever.
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

    // A fresh browser process/profile document excludes retained JS globals and
    // the previous document's data promises. All application bytes come from SW.
    context = await playwright[browserName].launchPersistentContext(profile, options);
    const page = context.pages()[0] || await context.newPage();
    await initializeStorage(page);
    const failures = [], errors = [], sourceFileRequests = [], fromWorker = new Set();
    page.on('request', request => {
      if (/\/insl3-age-source-(data|policy)\.json(?:\?|$)/.test(request.url())) sourceFileRequests.push(request.url());
    });
    page.on('requestfailed', request => {
      const url = new URL(request.url());
      if (url.origin !== server.origin || url.searchParams.has('insl3-offline-probe')) return;
      if (request.failure()?.errorText === 'net::ERR_ABORTED') return;
      failures.push(`${url.pathname}${url.search}: ${request.failure()?.errorText}`);
    });
    page.on('pageerror', error => errors.push(error.message));
    page.on('response', response => {
      if (response.fromServiceWorker()) fromWorker.add(new URL(response.url()).pathname);
    });
    await page.goto(`${server.origin}/przelicznik-jednostek.html`, { waitUntil: 'load' });
    await awaitConverter(page);
    expect(await page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true);
    const probe = () => page.evaluate(() => fetch(`/README.md?insl3-offline-probe=${Date.now()}`)
      .then(() => 'network', () => 'offline'));
    expect(await probe(), 'the origin server is stopped').toBe('offline');
    await setCurrentPatient(page, { age: 25 });
    await chooseLh(page);
    await selectInsl3(page);
    await expect(sources(page)).not.toHaveAttribute('open');
    await expect(source(page)).toBeHidden();
    await openSources(page);
    await expectValue(page, '1.27');
    const original = await geometry(page);
    for (const [age, value] of [[40, '1.25'], [25, '1.27'], [18, null]]) {
      await setQuickAge(page, age);
      if (value) await expectValue(page, value);
      else await expectUnavailable(page);
      await expect.poll(() => geometry(page)).toEqual(original);
      await expectNoInsl3Point(page);
    }
    // Reload again while offline, then use the real converter and quick form.
    await page.reload({ waitUntil: 'load' });
    await awaitConverter(page);
    await chooseLh(page);
    await selectInsl3(page);
    await setQuickAge(page, 40);
    await openSources(page);
    await expectValue(page, '1.25');
    await setQuickAge(page, 25);
    await expectValue(page, '1.27');
    await expectNoInsl3Point(page);
    // Separate authoring JSON files are embedded in the production data bundle;
    // they are not fetched by the application or promised as offline assets.
    expect(await page.evaluate(() => {
      const data = window.VildaHormoneLifespanData.insl3AgeSourceData;
      const policy = window.VildaHormoneLifespanData.insl3AgeSourcePolicy;
      return {
        sourceId: data.id, unit: data.source.unit, sourceActive: data.clinicalActivation,
        policySourceId: policy.sourceId, contextBasis: policy.contextBasis,
        bridgesAllowed: policy.bridgesAllowed, noPatientComparison: policy.noPatientComparison,
      };
    })).toEqual({
      sourceId: 'albrethsen2020-insl3-age-direct', unit: 'ng/mL', sourceActive: false,
      policySourceId: 'albrethsen2020-insl3-age-direct', contextBasis: 'current-form',
      bridgesAllowed: false, noPatientComparison: true,
    });
    expect(fromWorker.has('/vilda_insl3_age_source.js'), 'reader delivered by the production SW').toBe(true);
    expect(fromWorker.has('/vilda_hormone_lifespan_data.js'), 'data/policy runtime delivered by the production SW').toBe(true);
    expect(sourceFileRequests, 'UI reads the packaged runtime instead of uncached authoring files').toEqual([]);
    expect(await probe(), 'network remains absent after all edits and reload').toBe('offline');
    expect(failures, 'same-origin application resources must all be precached').toEqual([]);
    expect(errors).toEqual([]);
  } finally {
    await server.stop();
    if (context) await context.close();
    fs.rmSync(profile, { recursive: true, force: true });
  }
});
