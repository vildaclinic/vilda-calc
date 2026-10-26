import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';
import { start, mainPatient, fits, initializeStorage } from '../support/lh-infant-tail.mjs';

test.use({ serviceWorkers: 'allow', reducedMotion: 'reduce' });

const chart = page => page.locator('.vilda-hormone-lifespan');
const point = page => chart(page).locator('[data-patient-concentration="t"]');
async function choose(page, raw = '0.4') {
  await page.locator('#labSubstance').fill('Testosteron');
  await page.locator('#labSubstanceDropdown [data-id="testosterone_total"]').click();
  await page.locator('#labUnit').selectOption('nmol/L');
  await page.locator('#labUnitTarget').selectOption('nmol/L');
  await page.locator('#labValue').fill(raw);
  await expect(chart(page)).toBeVisible();
}
async function geometry(page) {
  return chart(page).locator('[data-stable-reference-line="t"]').evaluate(line => ({
    d: line.getAttribute('d'), viewBox: line.ownerSVGElement.getAttribute('viewBox'),
    divisor: line.getAttribute('data-divisor'), ceiling: line.getAttribute('data-ceiling'),
  }));
}
async function expectResultOnly(page, value) {
  await expect(point(page)).toHaveCount(1);
  await expect(point(page)).toHaveAttribute('data-result-only', 'true');
  await expect.poll(async () => Number(await point(page).getAttribute('data-value'))).toBeCloseTo(value, 12);
  for (const attribute of ['data-median', 'data-profile', 'data-reference-value', 'data-reference-statistic', 'data-ratio']) {
    expect(await point(page).getAttribute(attribute), attribute).toBeNull();
  }
  await expect(point(page).locator('line')).toHaveCount(0);
  await expect(chart(page).locator('[data-median-point], [data-dot-label="median"]')).toHaveCount(0);
  await expect(chart(page).locator('[data-lifespan="scale-note"]')).not.toContainText(/≈|rycin|niespójn|mediana/i);
}

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const documents = ['index.html', 'przelicznik-jednostek.html'];
const modules = ['lab_unit_converter.js', 'vilda_lab_testosterone_units.js', 'vilda_lab_testosterone_data.js', 'vilda_lab_testosterone.js', 'vilda_lab_puberty_data.js', 'vilda_lab_puberty.js', 'vilda_lab_puberty_ui.js',
  'vilda_lab_assessment_ui.js', 'vilda_lab_snapshot.js', 'vilda_hormone_lifespan_data.js',
  'vilda_hormone_lifespan_reference.js', 'vilda_hormone_lifespan_display.js',
  'vilda_hormone_lifespan.js', 'vilda_hormone_lifespan.css', 'vilda_dob_age.js',
  'vilda_lab_neonatal_context.js', 'vilda_puberty_source.js', 'vilda_persist_runtime.js',
  'vilda_data_import_export.js', 'vilda_session_bridge.js'];
const hash = bytes => createHash('sha256').update(bytes).digest('hex');

function currentResources() {
  const resources = new Map();
  const loaded = new Set();
  for (const name of documents) {
    const bytes = fs.readFileSync(path.join(root, name));
    resources.set('/' + name, { url: '/' + name, sha256: hash(bytes) });
    const urls = [...bytes.toString().matchAll(/\b(?:src|href)="([^"]+)"/g)].map(match => match[1]);
    for (const url of urls) if (modules.includes(url.split('?')[0])) {
      resources.set('/' + url, { url: '/' + url, sha256: hash(fs.readFileSync(path.join(root, url.split('?')[0]))) });
      loaded.add(url.split('?')[0]);
    }
  }
  expect([...loaded].sort(), 'all expected current production modules have real HTML URLs').toEqual([...modules].sort());
  return [...resources.values()];
}

async function server() {
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
    child.once('exit', code => reject(new Error(`Infant TT offline server exited before startup (${code})`)));
  });
  const stop = () => new Promise(resolve => {
    if (child.exitCode !== null || child.signalCode !== null) { resolve(); return; }
    child.once('exit', resolve);
    child.kill('SIGKILL');
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
    return { state: worker.state, script: worker.scriptURL, cacheNames: await caches.keys() };
  }, script);
}

test('current infant TT result-only policy and citations survive production SW update and a cold offline browser at320px', async ({ playwright, browserName, launchOptions }, testInfo) => {
  test.setTimeout(240_000);
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'vilda-infant-tt-result-only-offline-'));
  const origin = await server();
  const workerBytes = fs.readFileSync(path.join(root, 'service-worker-kalorii.js'));
  const version = /const SW_VERSION = '([^']+)'/.exec(workerBytes.toString())[1];
  const resources = currentResources();
  const launch = offline => playwright[browserName].launchPersistentContext(profile, {
    ...launchOptions, offline, serviceWorkers: 'allow', reducedMotion: 'reduce',
    locale: 'pl-PL', timezoneId: 'Europe/Warsaw', viewport: { width: 320, height: 1000 },
  });
  let context;
  try {
    context = await launch(false);
    const installer = context.pages()[0] || await context.newPage();
    await initializeStorage(installer);
    await installer.goto(`${origin.origin}/tests/fixtures/service-worker-runner.html`);
    const previous = await activate(installer, '/__test-service-worker-kalorii.js?wersja=infant-tt-result-only-prior');
    expect(previous.state).toBe('activated');
    expect(previous.cacheNames).toContain('pwa-kalorii-shell-vinfant-tt-result-only-prior');
    expect(await installer.evaluate(() => caches.match('/przelicznik-jednostek.html').then(Boolean))).toBe(false);
    const installed = await activate(installer, '/service-worker-kalorii.js');
    expect(installed.state).toBe('activated');
    expect(installed.cacheNames).toContain(`pwa-kalorii-shell-v${version}`);
    expect(installed.cacheNames).not.toContain('pwa-kalorii-shell-vinfant-tt-result-only-prior');
    await context.close(); context = null;
    await origin.stop();

    // A new process, explicit offline mode and stopped origin rule out an open
    // page or network request concealing missing production precache entries.
    context = await launch(true);
    const page = context.pages()[0] || await context.newPage();
    const delivered = new Map(), errors = [], failed = [], authoring = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('request', request => {
      if (/\/docs\/clinical\/hormone-lifespan\/|infant-tt.*\.json/.test(request.url())) authoring.push(request.url());
    });
    page.on('response', response => {
      const url = new URL(response.url());
      delivered.set(url.pathname + url.search, response.fromServiceWorker());
    });
    page.on('requestfailed', request => {
      const url = new URL(request.url());
      if (url.origin === origin.origin && !url.searchParams.has('infant-tt-offline-probe')
        && request.failure()?.errorText !== 'net::ERR_ABORTED') failed.push(url.pathname + url.search);
    });
    await start(page, { width: 320, origin: origin.origin, offline: true });
    await mainPatient(page, { days: 300, origin: origin.origin });
    await choose(page);
    await expectResultOnly(page, .4);
    const baseline = await geometry(page);
    await chart(page).locator('[data-view="mini"]').click();
    await expectResultOnly(page, .4);
    await page.locator('#labUnit').selectOption('ng/dL');
    await page.locator('#labValue').fill('10');
    await expectResultOnly(page, .3467);
    await expect(point(page)).toHaveAttribute('data-label-unit', 'ng/dL');
    await page.locator('#labValue').fill('<LOD');
    await expect(point(page)).toHaveCount(0);
    await choose(page);
    await expectResultOnly(page, .4);
    await chart(page).locator('[data-view="life"]').click();
    expect(await geometry(page)).toEqual(baseline);
    await chart(page).locator('[data-view="mini"]').click();
    await expectResultOnly(page, .4);
    await expect(chart(page).locator('.vhl-insight a[href="https://doi.org/10.1210/clinem/dgac115"]')).toBeVisible();
    await fits(page);
    await chart(page).screenshot({ path: testInfo.outputPath('tt-infant-result-only-cold-offline-320.png') });
    await page.reload({ waitUntil: 'load' });
    await page.waitForFunction(() => window.VildaVault?.isUnlocked() && window.VildaHormoneLifespanRuntime);
    await choose(page);
    await expectResultOnly(page, .4);
    await chart(page).locator('[data-hormone="t"]').click();
    await chart(page).locator('[data-hormone="t"]').click();
    await expect(chart(page).locator('.vhl-insight a[href="https://doi.org/10.1210/clinem/dgac155"]')).toBeVisible();
    await expect(chart(page).locator('.vhl-insight a[href="https://doi.org/10.1210/clinem/dgaf507"]')).toBeVisible();
    expect(await page.evaluate(() => fetch('/README.md?infant-tt-offline-probe=1').then(() => false, () => true))).toBe(true);
    for (const resource of resources) {
      expect(delivered.get(resource.url), resource.url + ' served by production SW').toBe(true);
      const actual = await page.evaluate(async url => {
        const response = await fetch(url);
        if (!response.ok) throw new Error('Missing offline asset ' + url);
        const digest = await crypto.subtle.digest('SHA-256', await response.arrayBuffer());
        return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
      }, resource.url);
      expect(actual, resource.url + ' exact current production bytes offline').toBe(resource.sha256);
    }
    expect(errors).toEqual([]);
    expect(failed).toEqual([]);
    expect(authoring).toEqual([]);
    await testInfo.attach('TT-infant-result-only-production-offline-evidence', { contentType: 'application/json', body: Buffer.from(JSON.stringify({
      baseline: 'installed-minimal-predecessor-to-full-production-SW', version, workerSHA256: hash(workerBytes), previous, installed, resources,
    }, null, 2)) });
  } finally {
    if (context) await context.close();
    await origin.stop();
    fs.rmSync(profile, { recursive: true, force: true });
  }
});
