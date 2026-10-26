import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';
import { initializeStorage, setCurrentPatient } from '../support/male-e2-age.mjs';

test.use({ serviceWorkers: 'allow', reducedMotion: 'reduce' });
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const documentName = 'przelicznik-jednostek.html';
const modules = ['vilda_lab_puberty_data.js', 'vilda_lab_puberty.js', 'vilda_lab_puberty_ui.js',
  'vilda_lab_assessment_ui.js', 'vilda_lab_assessment_ui.css', 'vilda_lab_snapshot.js',
  'vilda_hormone_lifespan_data.js', 'vilda_hormone_lifespan_reference.js',
  'vilda_hormone_lifespan_display.js', 'vilda_hormone_lifespan.js', 'vilda_hormone_lifespan.css'];
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const chart = page => page.locator('.vilda-hormone-lifespan');
const point = page => chart(page).locator('[data-patient-concentration="lh"]');
const comparison = page => page.locator('#labPubertyAssessment [data-comparison="prepubertal"]');
const sourceNote = page => chart(page).locator('[data-lh-childhood-source-note="wiedemann1993-table4-lh-pooled-2-11"]');

function resources() {
  const html = fs.readFileSync(path.join(root, documentName));
  const urls = [...html.toString().matchAll(/\b(?:src|href)="([^"]+)"/g)].map(match => match[1]);
  return [{ url: '/' + documentName, sha256: hash(html) }, ...modules.map(name => {
    const url = urls.find(url => url.split('?')[0] === name);
    if (!url) throw new Error(`Production converter does not load ${name}`);
    return { url: '/' + url, sha256: hash(fs.readFileSync(path.join(root, name))) };
  })];
}
async function startServer() {
  const child = spawn(process.execPath, [path.join(root, 'tests/support/static-server.mjs')], {
    env: { ...process.env, PORT: '0' }, stdio: ['ignore', 'pipe', 'inherit'],
  });
  const origin = await new Promise((resolve, reject) => {
    let output = '';
    child.stdout.on('data', bytes => {
      output += bytes;
      const match = /http:\/\/127\.0\.0\.1:\d+/.exec(output);
      if (match) resolve(match[0]);
    });
    child.once('error', reject);
    child.once('exit', code => reject(new Error(`LH childhood offline server exited before startup (${code})`)));
  });
  const stop = () => new Promise(resolve => {
    if (child.exitCode !== null || child.signalCode !== null) { resolve(); return; }
    child.once('exit', resolve); child.kill('SIGKILL');
  });
  return { origin, stop };
}
async function activate(page, script) {
  return page.evaluate(async script => {
    const registration = await navigator.serviceWorker.register(script, { scope: '/' });
    const worker = registration.installing || registration.waiting || registration.active;
    if (worker.state === 'installed') worker.postMessage({ type: 'SKIP_WAITING' });
    if (!['activated', 'redundant'].includes(worker.state)) await new Promise(resolve => {
      worker.addEventListener('statechange', () => {
        if (worker.state === 'installed') worker.postMessage({ type: 'SKIP_WAITING' });
        if (['activated', 'redundant'].includes(worker.state)) resolve();
      });
    });
    return { state: worker.state, url: worker.scriptURL, cacheNames: await caches.keys() };
  }, script);
}
async function choose(page, value = '0.4') {
  await page.locator('#labSubstance').fill('LH');
  await page.locator('#labSubstanceDropdown [data-id="lh"]').click();
  await page.locator('#labUnit').selectOption('IU/L');
  await page.locator('#labUnitTarget').selectOption('IU/L');
  await page.locator('#labValue').fill(value);
}
async function ready(page) {
  await page.waitForFunction(() => window.VildaLabPubertyRuntime && window.VildaHormoneLifespanRuntime && window.VildaPersistence);
  const decline = page.locator('#consent-decline');
  if (await decline.isVisible()) await decline.click();
  const guest = page.getByRole('button', { name: 'Korzystaj bez logowania', exact: true });
  if (await guest.isVisible()) await guest.click();
  await page.waitForFunction(() => !document.documentElement.classList.contains('vilda-auth-locked')
    && !window.VildaPersistence.isClearInProgress() && !(Number(window.__vildaPersistClearUntil || 0) > Date.now()));
}
async function capAndPoint(page, sex = 'M') {
  await expect(comparison(page)).toHaveAttribute('data-status', 'above');
  await expect(comparison(page).locator('.vilda-lab-axis')).toHaveAttribute('data-range-upper', '0.3');
  await expect(comparison(page).locator('.vilda-lab-axis')).toHaveAttribute('data-range-lower', 'unknown');
  await expect(page.locator('#labPubertyAssessment [data-prepubertal-interpretation="attention"]')).toContainText('Możliwa aktywacja osi pokwitania');
  await expect(point(page)).toHaveAttribute('data-result-only-policy', `childhood-${sex === 'M' ? 'male' : 'female'}-lh-result-only`);
  await expect(point(page)).toHaveAttribute('data-value', '0.4');
  await expect(point(page).locator('[data-result-point]')).toHaveCount(1);
  await expect(chart(page).locator('[data-median-point], [data-dot-label="median"]')).toHaveCount(0);
}

test('LH childhood reference survives production SW update, cold offline browser, source changes and snapshot creation at 320 px', async ({ playwright, browserName, launchOptions }, testInfo) => {
  test.setTimeout(240_000);
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'vilda-lh-childhood-offline-'));
  const server = await startServer();
  const workerBytes = fs.readFileSync(path.join(root, 'service-worker-kalorii.js'));
  const version = /const SW_VERSION = '([^']+)'/.exec(workerBytes.toString())[1];
  const currentResources = resources();
  const launch = offline => playwright[browserName].launchPersistentContext(directory, {
    ...launchOptions, offline, serviceWorkers: 'allow', reducedMotion: 'reduce',
    locale: 'pl-PL', timezoneId: 'Europe/Warsaw', viewport: { width: 320, height: 1000 },
  });
  let context;
  try {
    context = await launch(false);
    const installer = context.pages()[0] || await context.newPage();
    await initializeStorage(installer);
    await installer.goto(`${server.origin}/tests/fixtures/service-worker-runner.html`);
    // Existing minimal fixture establishes an installed predecessor. The update
    // itself installs the entire unmodified current production SW and precache.
    const previous = await activate(installer, '/__test-service-worker-kalorii.js?wersja=lh-childhood-prior');
    expect(previous.state).toBe('activated');
    expect(previous.cacheNames).toContain('pwa-kalorii-shell-vlh-childhood-prior');
    expect(await installer.evaluate(() => caches.match('/przelicznik-jednostek.html').then(Boolean))).toBe(false);
    const installed = await activate(installer, '/service-worker-kalorii.js');
    expect(installed.state).toBe('activated');
    expect(installed.url).toBe(`${server.origin}/service-worker-kalorii.js`);
    expect(installed.cacheNames).toContain(`pwa-kalorii-shell-v${version}`);
    expect(installed.cacheNames).not.toContain('pwa-kalorii-shell-vlh-childhood-prior');
    await context.close(); context = null;
    await server.stop();

    // A new browser process, explicit offline mode and physically absent origin
    // prevent an open page or live server from concealing an incomplete cache.
    context = await launch(true);
    await initializeStorage(context);
    const page = context.pages()[0] || await context.newPage();
    const errors = [], failures = [], authoring = [], delivered = new Map();
    page.on('pageerror', error => errors.push(error.message));
    page.on('request', request => {
      if (/\/docs\/clinical\/hormone-lifespan\/|\.json(?:\?|$)/.test(request.url()) && /(?:policy|childhood|lifespan-data)/.test(request.url())) authoring.push(request.url());
    });
    page.on('requestfailed', request => {
      const url = new URL(request.url());
      if (url.origin !== server.origin || url.searchParams.has('lh-childhood-offline-probe') || request.failure()?.errorText === 'net::ERR_ABORTED') return;
      failures.push(`${url.pathname}${url.search}: ${request.failure()?.errorText}`);
    });
    page.on('response', response => {
      const url = new URL(response.url());
      delivered.set(url.pathname + url.search, response.fromServiceWorker());
    });
    await page.goto(`${server.origin}/${documentName}`, { waitUntil: 'load' });
    await ready(page);
    const probe = () => page.evaluate(() => fetch('/README.md?lh-childhood-offline-probe=1').then(() => false, () => true));
    expect(await probe()).toBe(true);
    for (const resource of currentResources) {
      expect(delivered.get(resource.url), resource.url + ' delivered by actual production SW').toBe(true);
      const actualHash = await page.evaluate(async url => {
        const response = await fetch(url);
        if (!response.ok) throw new Error(`Offline resource failed: ${url}`);
        const digest = await crypto.subtle.digest('SHA-256', await response.arrayBuffer());
        return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
      }, resource.url);
      expect(actualHash, resource.url + ' current exact bytes offline').toBe(resource.sha256);
    }
    for (const sex of ['M', 'F']) {
      await setCurrentPatient(page, { age: 4, months: 0, sex });
      await choose(page);
      await capAndPoint(page, sex);
      const help = page.locator('#labPubertyAssessment details[data-prepubertal-method="true"]');
      await expect(help).not.toHaveAttribute('open');
      await help.locator('summary').click();
      await expect(help).toContainText('Sama nowość lub czułość testu nie oznacza jednak automatycznie niższej górnej granicy');
      await chart(page).locator('.vhl-sources summary').click();
      await expect(sourceNote(page)).toContainText(/<0[,.]07/);
      await expect(sourceNote(page)).toContainText(/282/);
      const saved = await page.evaluate(() => window.VildaLabPubertyRuntime.getAssessment({ testKey: 'lh', raw: '0.4', unit: 'IU/L' }));
      expect(saved.evaluation.prepubertalLh).toMatchObject({ orientingOnly: true, assayMatched: false,
        range: { bounds: { lower: null, upper: { operator: '<=', value: .3 } } },
        comparison: { status: 'above' }, interpretation: { title: 'Możliwa aktywacja osi pokwitania' } });
      await page.locator('#labUnit').selectOption('mIU/mL');
      await capAndPoint(page, sex);
      await page.locator('#labValue').fill('<0.4');
      await expect(comparison(page)).toHaveAttribute('data-status', 'indeterminate');
      await expect(point(page)).toHaveCount(0);
      await page.locator('#labValue').fill('<LOD');
      await expect(point(page)).toHaveCount(0);
      await expect(comparison(page)).toHaveAttribute('data-status', 'indeterminate');
    }
    await setCurrentPatient(page, { age: 1, months: 6, sex: 'M' });
    await choose(page);
    await expect(sourceNote(page)).toHaveCount(0);
    await capAndPoint(page);
    await setCurrentPatient(page, { age: 6, months: 0, sex: 'M' });
    await expect(point(page)).toHaveAttribute('data-profile', 'madsen2022-male-lh');
    await expect.poll(async () => Number(await point(page).getAttribute('data-reference-value'))).toBeCloseTo(.1193163370958486, 12);
    await expect(sourceNote(page)).toHaveCount(0);
    await setCurrentPatient(page, { age: 4, months: 0, sex: 'M' });
    await choose(page);
    await capAndPoint(page);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    await page.locator('#labResultPane').screenshot({ path: testInfo.outputPath('lh-childhood-offline-cap-320.png') });
    await chart(page).screenshot({ path: testInfo.outputPath('lh-childhood-offline-chart-320.png') });
    await page.reload({ waitUntil: 'load' });
    await ready(page);
    await choose(page);
    await capAndPoint(page);
    expect(await probe()).toBe(true);
    expect(authoring).toEqual([]);
    expect(failures).toEqual([]);
    expect(errors).toEqual([]);
    await testInfo.attach('LH-childhood-production-offline-evidence', { contentType: 'application/json', body: Buffer.from(JSON.stringify({
      baseline: 'existing-minimal-fixture-to-full-current-production-SW', version, workerSHA256: hash(workerBytes), previous, installed, resources: currentResources,
    }, null, 2)) });
  } finally {
    if (context) await context.close();
    await server.stop();
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
