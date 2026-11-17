import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';

// Production precache, a closed browser and a stopped origin. The converter is
// used without an account; all inputs are fictional and no vault is created.
test.use({ serviceWorkers: 'allow' });
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const hash = bytes => createHash('sha256').update(bytes).digest('hex');

function currentResources() {
  const html = fs.readFileSync(path.join(root, 'przelicznik-jednostek.html'));
  const urls = [...html.toString().matchAll(/\b(?:src|href)="([^"]+)"/g)].map(match => match[1]);
  return [{ url: '/przelicznik-jednostek.html', sha256: hash(html) }, ...[
    'vilda_persistence_adapter.js', 'vilda_chrome.js',
  ].map(file => {
    const url = urls.find(value => value.split('?')[0] === file);
    if (!url) throw new Error(`Converter does not load ${file}`);
    return { url: '/' + url, sha256: hash(fs.readFileSync(path.join(root, file))) };
  })];
}

async function ownServer() {
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
    child.once('exit', code => reject(new Error(`Laboratory reset server exited before startup (${code})`)));
  });
  return { origin, stop: () => new Promise(resolve => {
    if (child.exitCode !== null || child.signalCode !== null) { resolve(); return; }
    child.once('exit', resolve);
    child.kill('SIGKILL');
  }) };
}

async function expectEmptyConverter(page) {
  for (const id of ['labSubstance', 'labValue', 'labUnit', 'labUnitTarget',
    'labOverrideSex', 'labOverrideAge', 'labOverrideAgeMonths', 'labOverrideCycle',
    'labOverrideTanner', 'labMeasTime', 'labMeasProtocol', 'labMeasMethod']) {
    await expect(page.locator('#' + id), id).toHaveValue('');
  }
  expect(await page.evaluate(() => [
    'LAB_CONV_SUBSTANCE', 'LAB_CONV_UNIT:cortisol', 'LAB_CONV_UNIT:target:cortisol',
  ].map(key => window.VildaPersistence.readPreferenceRaw(key, null)))).toEqual([null, null, null]);
}

test('wyczyszczenie Jednostek lab. pozostaje puste po zimnym restarcie produkcyjnej PWA offline', async ({ playwright, browserName, launchOptions }) => {
  test.setTimeout(180_000);
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'vilda-lab-reset-offline-'));
  const server = await ownServer();
  const resources = currentResources();
  const launch = () => playwright[browserName].launchPersistentContext(profile, {
    ...launchOptions, serviceWorkers: 'allow', locale: 'pl-PL', viewport: { width: 1280, height: 1000 },
  });
  let context;
  try {
    context = await launch();
    const page = context.pages()[0] || await context.newPage();
    await page.goto(server.origin + '/tests/fixtures/service-worker-runner.html');
    expect(await page.evaluate(async () => {
      const registration = await navigator.serviceWorker.register('/service-worker-kalorii.js', { scope: '/' });
      const worker = registration.installing || registration.waiting || registration.active;
      if (!['activated', 'redundant'].includes(worker.state)) await new Promise(resolve => {
        worker.addEventListener('statechange', () => {
          if (['activated', 'redundant'].includes(worker.state)) resolve();
        });
      });
      return worker.state;
    }), 'full production worker installed and activated').toBe('activated');

    await page.goto(server.origin + '/przelicznik-jednostek.html', { waitUntil: 'load' });
    await page.waitForFunction(() => Boolean(window.VildaLabConverterRuntime));
    const consent = page.locator('#consent-decline');
    if (await consent.isVisible()) await consent.click();
    await page.locator('#labSubstance').fill('Kortyzol');
    await page.locator('#labSubstanceDropdown .lab-substance-option[data-id="cortisol"]').click();
    await page.locator('#labUnit').selectOption({ index: 1 });
    await page.locator('#labUnitTarget').selectOption({ index: 2 });
    await page.locator('#labValue').fill('10');
    await page.locator('#labPatientToggle').click();
    await page.locator('#labOverrideSex').selectOption('F');
    await page.locator('#labOverrideAge').fill('30');
    expect(await page.evaluate(() => window.VildaPersistence.readPreferenceRaw('LAB_CONV_SUBSTANCE', null))).toBe('cortisol');
    expect(await page.evaluate(() => window.VildaPersistence.readPreferenceRaw('LAB_CONV_UNIT:cortisol', null))).toBeTruthy();
    expect(await page.evaluate(() => window.VildaPersistence.readPreferenceRaw('LAB_CONV_UNIT:target:cortisol', null))).toBeTruthy();

    await page.locator('#labClearBtn').click();
    await expectEmptyConverter(page);
    await context.close(); context = null;
    await server.stop();
    expect(await fetch(server.origin + '/README.md', { signal: AbortSignal.timeout(3000) }).then(() => false, () => true),
      'origin stopped before a new browser process starts').toBe(true);

    context = await launch();
    const offline = context.pages()[0] || await context.newPage();
    const loaded = new Map();
    offline.on('response', response => {
      const url = new URL(response.url());
      if (url.origin === server.origin) loaded.set(url.pathname + url.search, response.fromServiceWorker());
    });
    await offline.goto(server.origin + '/przelicznik-jednostek.html', { waitUntil: 'load' });
    await offline.waitForFunction(() => Boolean(window.VildaLabConverterRuntime));
    await expectEmptyConverter(offline);
    expect(await offline.evaluate(() => new URL(navigator.serviceWorker.controller.scriptURL).pathname))
      .toBe('/service-worker-kalorii.js');
    expect(await offline.evaluate(() => fetch('/__lab-reset-no-network-' + Date.now()).then(() => false, () => true))).toBe(true);
    for (const resource of resources) {
      expect(loaded.get(resource.url), resource.url + ' loaded by production SW after browser restart').toBe(true);
      const actualHash = await offline.evaluate(async url => {
        const response = await fetch(url);
        if (!response.ok) throw new Error('Missing offline reset resource: ' + url);
        const digest = await crypto.subtle.digest('SHA-256', await response.arrayBuffer());
        return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
      }, resource.url);
      expect(actualHash, resource.url + ' current source bytes in production cache').toBe(resource.sha256);
    }
  } finally {
    if (context) await context.close();
    await server.stop();
    fs.rmSync(profile, { recursive: true, force: true });
  }
});
