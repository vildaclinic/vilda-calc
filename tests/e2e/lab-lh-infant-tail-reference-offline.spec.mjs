import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';
import { chart, point, start, mainPatient, choose, expectNumeric, expectResultOnly,
  geometry, fits, initializeStorage } from '../support/lh-infant-tail.mjs';

test.use({ serviceWorkers: 'allow', reducedMotion: 'reduce' });
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const documents = ['index.html', 'przelicznik-jednostek.html'];
const modules = ['vilda_lab_puberty_data.js', 'vilda_lab_puberty.js', 'vilda_lab_puberty_ui.js',
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
    child.once('exit', code => reject(new Error(`Infant LH offline server exited before startup (${code})`)));
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

test('current late-infant LH source and result-only policy survive production SW update and a cold offline browser at320px', async ({ playwright, browserName, launchOptions }, testInfo) => {
  test.setTimeout(240_000);
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'vilda-infant-lh-tail-offline-'));
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
    const previous = await activate(installer, '/__test-service-worker-kalorii.js?wersja=infant-lh-tail-prior');
    expect(previous.state).toBe('activated');
    expect(previous.cacheNames).toContain('pwa-kalorii-shell-vinfant-lh-tail-prior');
    expect(await installer.evaluate(() => caches.match('/przelicznik-jednostek.html').then(Boolean))).toBe(false);
    const installed = await activate(installer, '/service-worker-kalorii.js');
    expect(installed.state).toBe('activated');
    expect(installed.cacheNames).toContain(`pwa-kalorii-shell-v${version}`);
    expect(installed.cacheNames).not.toContain('pwa-kalorii-shell-vinfant-lh-tail-prior');
    await context.close(); context = null;
    await origin.stop();

    // A new process, explicit offline mode and stopped origin rule out an open
    // page or network request concealing missing production precache entries.
    context = await launch(true);
    const page = context.pages()[0] || await context.newPage();
    const delivered = new Map(), errors = [], failed = [], authoring = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('request', request => {
      if (/\/docs\/clinical\/hormone-lifespan\/|infant-lh.*\.json/.test(request.url())) authoring.push(request.url());
    });
    page.on('response', response => {
      const url = new URL(response.url());
      delivered.set(url.pathname + url.search, response.fromServiceWorker());
    });
    page.on('requestfailed', request => {
      const url = new URL(request.url());
      if (url.origin === origin.origin && !url.searchParams.has('infant-lh-offline-probe')
        && request.failure()?.errorText !== 'net::ERR_ABORTED') failed.push(url.pathname + url.search);
    });
    await start(page, { width: 320, origin: origin.origin, offline: true });
    await mainPatient(page, { days: 300, origin: origin.origin });
    await choose(page);
    await expectNumeric(page, .4, .070858);
    const baseline = await geometry(page);
    await chart(page).locator('[data-view="mini"]').click();
    await expectNumeric(page, .4, .070858);
    await page.locator('#labUnit').selectOption('mIU/mL');
    await expect(point(page)).toHaveAttribute('data-label-unit', 'mIU/mL');
    await page.locator('#labValue').fill('<LOD');
    await expect(point(page)).toHaveCount(0);
    await mainPatient(page, { days: 350, origin: origin.origin });
    await choose(page);
    await expectResultOnly(page, .4);
    expect(await geometry(page)).toEqual(baseline);
    await chart(page).locator('[data-view="mini"]').click();
    await expectResultOnly(page, .4);
    await fits(page);
    await chart(page).screenshot({ path: testInfo.outputPath('lh-infant-tail-cold-offline-320.png') });
    await page.reload({ waitUntil: 'load' });
    await page.waitForFunction(() => window.VildaVault?.isUnlocked() && window.VildaHormoneLifespanRuntime);
    await choose(page);
    await expectResultOnly(page, .4);
    expect(await page.evaluate(() => fetch('/README.md?infant-lh-offline-probe=1').then(() => false, () => true))).toBe(true);
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
    await testInfo.attach('LH-infant-tail-production-offline-evidence', { contentType: 'application/json', body: Buffer.from(JSON.stringify({
      baseline: 'installed-minimal-predecessor-to-full-production-SW', version, workerSHA256: hash(workerBytes), previous, installed, resources,
    }, null, 2)) });
  } finally {
    if (context) await context.close();
    await origin.stop();
    fs.rmSync(profile, { recursive: true, force: true });
  }
});
