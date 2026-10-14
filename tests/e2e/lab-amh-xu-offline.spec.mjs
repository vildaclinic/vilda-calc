import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';

test.use({ serviceWorkers: 'allow' });
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const converter = fs.readFileSync(path.join(root, 'przelicznik-jednostek.html'), 'utf8');
const resources = ['vilda_amh_age_reference_data.js', 'vilda_amh_age_reference.js',
  'vilda_amh_age_reference_ui.js', 'vilda_amh_age_reference_ui.css'].map(name => ({
  url: '/' + [...converter.matchAll(/(?:src|href)="([^"]+)"/g)].map(match => match[1])
    .find(url => url.split('?')[0] === name),
  sha256: createHash('sha256').update(fs.readFileSync(path.join(root, name))).digest('hex'),
}));

async function startServer() {
  const child = spawn(process.execPath, [path.join(root, 'tests/support/static-server.mjs')], {
    env: { ...process.env, PORT: '0' }, stdio: ['ignore', 'pipe', 'inherit'],
  });
  const origin = await new Promise((resolve, reject) => {
    let output = '';
    child.stdout.on('data', chunk => {
      output += chunk;
      const match = /http:\/\/127\.0\.0\.1:(\d+)/.exec(output);
      if (match) resolve(`http://127.0.0.1:${match[1]}`);
    });
    child.once('error', reject);
    child.once('exit', code => reject(new Error(`Static server exited before startup: ${code}`)));
  });
  return { origin, stop: () => new Promise(resolve => {
    if (child.exitCode !== null || child.signalCode !== null) { resolve(); return; }
    child.once('exit', resolve);
    child.kill('SIGKILL');
  }) };
}

async function selectAmh(page) {
  await page.locator('#labSubstance').fill('AMH');
  await page.locator('#labSubstanceDropdown [data-id="amh"]').click();
  await page.locator('#labUnit').selectOption('ng/mL');
  await page.locator('#labUnitTarget').selectOption('ng/mL');
  await page.locator('#labValue').fill('0.10');
}

async function expectPublishedPoints(page, unit = 'ng/mL') {
  const host = page.locator('#labAmhAgeReference');
  await expect(host).toBeVisible();
  await expect(host.locator('[data-amh-age]')).toHaveCount(2);
  for (const [age, canonical] of [[45, .365121103], [50, .045923937]]) {
    const point = host.locator(`[data-amh-age="${age}"]`);
    await expect(point).toHaveAttribute('data-canonical-value', String(canonical));
    await expect(point).toHaveAttribute('data-unit', unit);
    await expect.poll(async () => Number(await point.getAttribute('data-value')))
      .toBeCloseTo(unit === 'ng/mL' ? canonical : canonical / .1401, 10);
  }
  await expect(host.locator('[data-amh-age="47"]')).toHaveCount(0);
}

// Full production precache, an isolated persistent profile, and a stopped
// origin server. The converter is first opened only after the entire browser
// has been closed and restarted: HTTP or document memory cannot rescue it.
test('Xu AMH source and renderer survive a cold browser restart without the origin server', async ({ playwright, browserName, launchOptions }) => {
  test.setTimeout(180_000);
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'vilda-xu-offline-'));
  const server = await startServer();
  const launch = () => playwright[browserName].launchPersistentContext(profile, {
    ...launchOptions, serviceWorkers: 'allow', locale: 'pl-PL', viewport: { width: 1440, height: 1000 },
  });
  let context;
  try {
    context = await launch();
    const installer = context.pages()[0] || await context.newPage();
    await installer.goto(`${server.origin}/tests/fixtures/service-worker-runner.html`);
    const state = await installer.evaluate(async () => {
      const registration = await navigator.serviceWorker.register('/service-worker-kalorii.js', { scope: '/' });
      const worker = registration.installing || registration.waiting || registration.active;
      const finished = () => ['activated', 'redundant'].includes(worker.state);
      if (!finished()) await new Promise(resolve => {
        worker.addEventListener('statechange', () => { if (finished()) resolve(); });
      });
      return worker.state;
    });
    expect(state, 'complete production SW installation and activation').toBe('activated');
    await context.close();
    context = null;
    await server.stop();

    context = await launch();
    await context.addInitScript(() => {
      localStorage.setItem('vilda-terms-accepted-v1', JSON.stringify({ version: 1, acceptedAtISO: new Date().toISOString() }));
    });
    const page = context.pages()[0] || await context.newPage();
    const loaded = new Map();
    page.on('response', response => {
      const url = new URL(response.url());
      if (resources.some(resource => resource.url === url.pathname + url.search)) {
        loaded.set(url.pathname + url.search, response.fromServiceWorker());
      }
    });
    await page.goto(`${server.origin}/przelicznik-jednostek.html`, { waitUntil: 'load' });
    await page.waitForFunction(() => Boolean(window.VildaAmhAgeReferenceRuntime && window.VildaPersistence));
    const noNetwork = () => page.evaluate(() => fetch(`/README.md?offline-probe=${Date.now()}`).then(() => false, () => true));
    expect(await noNetwork(), 'origin server stopped before cold start').toBe(true);
    for (const resource of resources) {
      expect(loaded.get(resource.url), `${resource.url} loaded by the production SW`).toBe(true);
      const sha256 = await page.evaluate(async url => {
        const response = await fetch(url);
        if (!response.ok) throw new Error(`Cannot read cached resource ${url}: ${response.status}`);
        const bytes = await crypto.subtle.digest('SHA-256', await response.arrayBuffer());
        return [...new Uint8Array(bytes)].map(byte => byte.toString(16).padStart(2, '0')).join('');
      }, resource.url);
      expect(sha256, `offline bytes match the current source: ${resource.url}`).toBe(resource.sha256);
    }

    // A fictional guest context exercises the production source reader; no
    // vault, reference API or runtime method is mocked or replaced.
    await page.evaluate(() => {
      if (!window.VildaPersistence.writeShared({ name: 'Fikcyjna Pacjentka Xu Offline', sex: 'F', age: 47, ageMonths: 0 }, { force: true })) {
        throw new Error('Cannot create fictional offline context');
      }
      document.dispatchEvent(new CustomEvent('vilda:session-changed'));
    });
    await selectAmh(page);
    await expectPublishedPoints(page);
    await expect(page.locator('#labAmhAgeReference .vaar-points')).toHaveCSS('display', 'grid');
    await page.locator('#labUnitTarget').selectOption('pmol/L');
    await expectPublishedPoints(page, 'pmol/L');
    await page.reload({ waitUntil: 'load' });
    await selectAmh(page);
    await expectPublishedPoints(page);
    const details = page.locator('#labAmhAgeReference details');
    await details.locator('summary').click();
    await expect(details).toContainText('HS-AMH');
    await expect(details).toContainText('Kangrun');
    await expect(details.locator('a')).toHaveAttribute('href', 'https://doi.org/10.1097/CM9.0000000000004161');
    for (const width of [320, 390]) {
      await page.setViewportSize({ width, height: 1000 });
      await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
        { message: `expanded Xu source has no horizontal overflow at ${width}px offline` }).toBe(true);
    }
    expect(await noNetwork(), 'origin remains unavailable after rendering and reload').toBe(true);
  } finally {
    if (context) await context.close();
    await server.stop();
    fs.rmSync(profile, { recursive: true, force: true });
  }
});
