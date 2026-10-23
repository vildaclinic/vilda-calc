import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';

test.use({ serviceWorkers: 'allow' });
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const html = fs.readFileSync(path.join(root, 'kalkulator-klirens.html'), 'utf8');
const scriptUrls = [...html.matchAll(/<script\b[^>]*\bsrc="([^"]+)"[^>]*>/g)].map(match => match[1]);
const moduleNames = ['clcr_measured_clearance_reference_data.js', 'clcr_measured_clearance_reference.js'];
const resources = moduleNames.map(name => {
  const url = scriptUrls.find(value => value.split('?')[0] === name);
  if (!url) throw new Error(`Klirens does not load ${name}`);
  return { url: '/' + url, sha256: createHash('sha256').update(fs.readFileSync(path.join(root, name))).digest('hex') };
});
const workerSource = fs.readFileSync(path.join(root, 'service-worker-kalorii.js'), 'utf8');
const workerVersion = /const SW_VERSION = '([^']+)'/.exec(workerSource)[1];

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

async function installWorker(page, origin) {
  await page.goto(`${origin}/tests/fixtures/service-worker-runner.html`);
  const state = await page.evaluate(async () => {
    const registration = await navigator.serviceWorker.register('/service-worker-kalorii.js', { scope: '/' });
    const worker = registration.installing || registration.waiting || registration.active;
    const finished = () => ['activated', 'redundant'].includes(worker.state);
    if (!finished()) await new Promise(resolve => {
      worker.addEventListener('statechange', () => { if (finished()) resolve(); });
    });
    return worker.state;
  });
  expect(state, 'complete unmodified production SW installation and activation').toBe('activated');
  // This is checked before visiting Klirens. A prior page request must not hide
  // a missing precache entry by placing the dependency in the runtime cache.
  const cached = await page.evaluate(async ({ version, urls }) => {
    const shell = await caches.open(`pwa-kalorii-shell-v${version}`);
    return Promise.all(urls.map(async url => ({ url, present: Boolean(await shell.match(url)) })));
  }, { version: workerVersion, urls: resources.map(resource => resource.url) });
  expect(cached).toEqual(resources.map(resource => ({ url: resource.url, present: true })));
}

async function openOfflineCalculator(context, origin) {
  const page = await context.newPage();
  const loaded = new Map();
  page.on('response', response => {
    const url = new URL(response.url());
    const key = url.pathname + url.search;
    if (resources.some(resource => resource.url === key)) loaded.set(key, response.fromServiceWorker());
  });
  await page.goto(`${origin}/kalkulator-klirens.html`, { waitUntil: 'load' });
  await page.waitForFunction(() => Boolean(window.VildaVault && window.ClcrUiWorkflow &&
    window.ClcrMeasuredClearanceReference && window.ClcrMeasuredClearanceReferenceData));
  const guest = page.getByRole('button', { name: 'Korzystaj bez logowania', exact: true });
  if (await guest.isVisible()) await guest.click();
  await page.waitForFunction(() => !document.documentElement.classList.contains('vilda-auth-locked') &&
    document.documentElement.classList.contains('clcr-workflow-ready') &&
    typeof window.applyClcrSessionSnapshot === 'function' && window.clcrIsResetting !== true);
  if (await page.locator('#consent-decline').isVisible()) await page.locator('#consent-decline').click();
  expect(await page.evaluate(() => window.VildaVault.isUnlocked()), 'guest test never unlocks the vault').toBe(false);
  expect(await page.evaluate(() => new URL(navigator.serviceWorker.controller.scriptURL).pathname)).toBe('/service-worker-kalorii.js');
  expect(await page.evaluate(() => fetch(`/__cl24-offline-probe-${Date.now()}`).then(() => false, () => true)),
    'the origin is unavailable before clinical data entry').toBe(true);
  for (const resource of resources) {
    expect(loaded.get(resource.url), `${resource.url} loaded through the production SW`).toBe(true);
    const hash = await page.evaluate(async url => {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`Missing cached ${url}: ${response.status}`);
      const digest = await crypto.subtle.digest('SHA-256', await response.arrayBuffer());
      return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
    }, resource.url);
    expect(hash, `offline bytes match the current module: ${resource.url}`).toBe(resource.sha256);
  }
  return page;
}

async function enterFictionalResult(page) {
  // Patient context is applied through the production restore adapter. The
  // four clinical inputs remain empty and are then entered through the UI.
  expect(await page.evaluate(() => window.applyClcrSessionSnapshot({
    version: 2, currentVersion: 'advanced', selectedFormula: 'cl24', inputs: {
      currentVersion: 'advanced', formulaPicker: 'cl24', age: '45', ageMonths: '', ageDays: '',
      sex: 'M', weight: '70', height: '175', Scr: '', ScrUnit: 'mg/dl', Ucr: '', V24: '',
      Cl24DurationHours: '', Cl24DurationSource: 'hours', ScrAssay: '', creatinineState: 'unknown',
      suspectedAKI: false, Cl24CollectionProblem: false,
    },
  }, { source: 'e2e-cl24-offline-fictional', update: true, dispatchEvents: false, preserveAcrossVersions: true }))).toBe(true);
  await expect(page.locator('#formulaPicker')).toHaveValue('cl24');
  await page.waitForFunction(() => window.ClcrUiWorkflow.state.activeFormulaId === 'cl24' && window.clcrIsResetting !== true);
  for (const [id, value] of [['Scr', '1'], ['Ucr', '100'], ['V24', '1440'], ['Cl24DurationHours', '24']]) {
    await page.locator(`#${id}`).fill(value);
  }
  const card = page.locator('#clcrResultReport .clcr-result-card[data-clcr-series="cl24"]');
  await expect(card).toBeVisible();
  await expect(page.locator('#clcrResultReport .clcr-result-card:visible')).toHaveCount(1);
  await expect(card).toHaveAttribute('data-clcr-value', '100');
  await expect(card.locator('.clcr-result-value')).toHaveText('100');
  await expect(card.locator('.clcr-result-unit')).toHaveText('mL/min');
  await expect(card).toHaveAttribute('data-clcr-tone', 'success');
  await expect(card).toHaveAttribute('data-clcr-category', '');
  await expect(card.locator('.clcr-measured-reference-line')).toHaveText('Norma: ≈86,5–135,7 mL/min');
  await expect(card.locator('.clcr-measured-reference-source a')).toHaveAttribute('href',
    'https://pathwesttd.health.wa.gov.au/testdirectory/testdetail.aspx?TestID=521');
  await expect(page.locator('#clcrDataCompletion')).toContainText('4/4');
  await expect(page.locator('#clcrVisitSaveBtn')).toBeDisabled();
  const snapshot = JSON.parse(await card.getAttribute('data-clcr-measured-reference'));
  expect(snapshot).toMatchObject({ available: true, status: 'within', value: 100, unit: 'mL/min',
    profileId: 'PATHWEST_CCL_2026_03_20', profileVersion: 1, ageYears: 45, sex: 'M',
    durationHours: 24, durationSource: 'hours', bsaMethod: 'Du Bois', referencePreview: true,
    indexedRange: { lower: 81, upper: 127, unit: 'mL/min/1,73 m²' },
  });
  expect(snapshot.absoluteRange.lower).toBeCloseTo(86.53155171550813, 8);
  expect(snapshot.absoluteRange.upper).toBeCloseTo(135.67292676382138, 8);
  expect(await page.evaluate(() => window.VildaVault.isUnlocked())).toBe(false);
  return snapshot;
}

// Install the full production worker in a fresh profile, then stop the origin
// and restart the browser before first opening Klirens. Re-entering the same
// fictional inputs in a second offline page tests repeatable calculation, not
// a claim that guest form fields persist across browser restarts.
test('zmierzony klirens: pełny precache i zimny restart offline zachowują wynik oraz źródło normy', async ({ playwright, browserName, launchOptions }) => {
  test.setTimeout(180_000);
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'vilda-cl24-offline-'));
  const server = await startServer();
  const launch = () => playwright[browserName].launchPersistentContext(profile, {
    ...launchOptions, serviceWorkers: 'allow', locale: 'pl-PL', timezoneId: 'Europe/Warsaw',
    reducedMotion: 'reduce', viewport: { width: 1440, height: 1000 },
  });
  let context;
  try {
    context = await launch();
    await installWorker(context.pages()[0] || await context.newPage(), server.origin);
    await context.close();
    context = null;
    await server.stop();
    context = await launch();
    await context.setOffline(true);
    await context.addInitScript(() => {
      localStorage.setItem('vilda-terms-accepted-v1', JSON.stringify({ version: 1, acceptedAtISO: new Date().toISOString() }));
    });
    const first = await openOfflineCalculator(context, server.origin);
    const expected = await enterFictionalResult(first);
    await first.close();
    const reopened = await openOfflineCalculator(context, server.origin);
    expect(await enterFictionalResult(reopened), 'fresh offline page reproduces the complete reference metadata').toEqual(expected);
  } finally {
    if (context) await context.close();
    await server.stop();
    fs.rmSync(profile, { recursive: true, force: true });
  }
});
