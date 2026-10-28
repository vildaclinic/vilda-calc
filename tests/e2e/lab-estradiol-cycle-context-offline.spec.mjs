import { createHash } from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';

test.use({ serviceWorkers: 'allow' });
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const converterDocument = 'przelicznik-jednostek.html';
const modules = ['lab_units_data.js', 'lab_unit_converter.js', 'vilda_lab_range_snapshot.js', 'lab_pin_result.js'];
const phases = ['follicular', 'ovulation', 'luteal', 'postmenopause'];
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const versionOf = source => /const SW_VERSION = '([^']+)'/.exec(source)[1];

function resourcesFor(tree = root) {
  const html = fs.readFileSync(path.join(tree, converterDocument));
  const scripts = [...html.toString().matchAll(/<script\b[^>]*\bsrc="([^"]+)"[^>]*>/g)].map(match => match[1]);
  return [{ url: '/' + converterDocument, sha256: sha256(html) }, ...modules.map(name => {
    const url = scripts.find(candidate => candidate.split('?')[0] === name);
    if (!url) throw new Error(`The production converter does not load ${name}`);
    return { url: '/' + url, sha256: sha256(fs.readFileSync(path.join(tree, name))) };
  })];
}

// The normal suite checks the real SW lifecycle with a preceding SW_VERSION
// header and current assets. It does not claim to recreate an archived clinical
// release. A separate manual audit can provide an actual archived checkout via
// VILDA_E2_UPDATE_BASE_ROOT: then every preceding response comes from that tree,
// with its unmodified SW and old resource versions, until promotion.
async function deploymentServer(upgrade) {
  const currentWorker = fs.readFileSync(path.join(root, 'service-worker-kalorii.js'), 'utf8');
  const version = versionOf(currentWorker);
  const archive = upgrade && process.env.VILDA_E2_UPDATE_BASE_ROOT;
  const previousRoot = archive ? path.resolve(archive) : root;
  const pieces = version.split('.').map(Number);
  pieces[pieces.length - 1] -= 1;
  const previousWorker = archive
    ? fs.readFileSync(path.join(previousRoot, 'service-worker-kalorii.js'), 'utf8')
    : currentWorker.replace(`const SW_VERSION = '${version}'`, `const SW_VERSION = '${pieces.join('.')}'`);
  const previousVersion = versionOf(previousWorker);
  if (upgrade && previousVersion === version) throw new Error('The update scenario requires distinct production SW versions');
  let promoted = !upgrade;
  const workerResponses = [];
  const types = new Map([['.html', 'text/html'], ['.js', 'text/javascript'], ['.mjs', 'text/javascript'],
    ['.css', 'text/css'], ['.json', 'application/json'], ['.svg', 'image/svg+xml'], ['.png', 'image/png'],
    ['.jpg', 'image/jpeg'], ['.jpeg', 'image/jpeg'], ['.webp', 'image/webp'], ['.ico', 'image/x-icon']]);
  const server = http.createServer((request, response) => {
    const pathname = decodeURIComponent(new URL(request.url, 'http://127.0.0.1').pathname);
    if (pathname === '/service-worker-kalorii.js') {
      const bytes = promoted ? currentWorker : previousWorker;
      workerResponses.push({ version: versionOf(bytes), sha256: sha256(bytes) });
      response.writeHead(200, { 'Content-Type': 'text/javascript; charset=utf-8', 'Cache-Control': 'no-store', 'Service-Worker-Allowed': '/' });
      response.end(bytes);
      return;
    }
    const tree = promoted ? root : previousRoot;
    const absolute = path.resolve(tree, '.' + (pathname === '/' ? '/index.html' : pathname));
    if (!absolute.startsWith(tree + path.sep)) { response.writeHead(403); response.end(); return; }
    fs.readFile(absolute, (error, bytes) => {
      if (error) { response.writeHead(404); response.end(); return; }
      response.writeHead(200, { 'Content-Type': types.get(path.extname(absolute)) || 'application/octet-stream', 'Cache-Control': 'no-cache' });
      response.end(bytes);
    });
  });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  return {
    origin: `http://127.0.0.1:${server.address().port}`, version, previousVersion,
    baseline: archive ? 'archived-production-tree' : 'current-assets-with-preceding-version-header',
    precedingResources: upgrade ? resourcesFor(previousRoot) : [],
    currentWorkerHash: sha256(currentWorker), previousWorkerHash: sha256(previousWorker), workerResponses,
    promote: () => { promoted = true; },
    stop: () => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }),
  };
}

async function installWorker(page, origin) {
  await page.goto(`${origin}/tests/fixtures/service-worker-runner.html`);
  const state = await page.evaluate(async () => {
    const registration = await navigator.serviceWorker.register('/service-worker-kalorii.js', { scope: '/' });
    const worker = registration.installing || registration.waiting || registration.active;
    if (!['activated', 'redundant'].includes(worker.state)) await new Promise(resolve => {
      worker.addEventListener('statechange', () => { if (['activated', 'redundant'].includes(worker.state)) resolve(); });
    });
    return worker.state;
  });
  expect(state, 'the complete production precache finishes installation and activation').toBe('activated');
}

async function updateWorker(page, deployment) {
  expect(await page.evaluate(() => caches.keys())).toContain(`pwa-kalorii-shell-v${deployment.previousVersion}`);
  for (const resource of deployment.precedingResources) {
    const hash = await page.evaluate(async ({ version, url }) => {
      const cache = await caches.open(`pwa-kalorii-shell-v${version}`);
      const response = await cache.match(url);
      if (!response) throw new Error(`The preceding production cache lacks ${url}`);
      const digest = await crypto.subtle.digest('SHA-256', await response.arrayBuffer());
      return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
    }, { version: deployment.previousVersion, url: resource.url });
    expect(hash, `${resource.url} is present with exact preceding deployment bytes before the update`).toBe(resource.sha256);
  }
  deployment.promote();
  const state = await page.evaluate(async () => {
    const registration = await navigator.serviceWorker.getRegistration('/');
    const previous = registration.active;
    await registration.update();
    const worker = registration.installing || registration.waiting;
    if (!worker || worker === previous) throw new Error('No new production worker started installation');
    if (!['installed', 'activated', 'redundant'].includes(worker.state)) await new Promise(resolve => {
      worker.addEventListener('statechange', () => { if (['installed', 'activated', 'redundant'].includes(worker.state)) resolve(); });
    });
    if (worker.state === 'installed') worker.postMessage({ type: 'SKIP_WAITING' });
    if (!['activated', 'redundant'].includes(worker.state)) await new Promise(resolve => {
      worker.addEventListener('statechange', () => { if (['activated', 'redundant'].includes(worker.state)) resolve(); });
    });
    return worker.state;
  });
  expect(state).toBe('activated');
  await expect.poll(() => page.evaluate(() => caches.keys())).not.toContain(`pwa-kalorii-shell-v${deployment.previousVersion}`);
  expect(await page.evaluate(() => caches.keys())).toContain(`pwa-kalorii-shell-v${deployment.version}`);
}

async function guest(page) {
  const decline = page.locator('#consent-decline');
  if (await decline.isVisible()) await decline.click();
  const enter = page.getByRole('button', { name: 'Korzystaj bez logowania', exact: true });
  if (await enter.isVisible()) await enter.click();
  await page.waitForFunction(() => !document.documentElement.classList.contains('vilda-auth-locked') &&
    !window.VildaPersistence.isClearInProgress() && !(Number(window.__vildaPersistClearUntil || 0) > Date.now()));
}

async function writePatient(page) {
  await page.evaluate(() => {
    if (!window.VildaPersistence.writeShared({ name: 'Fikcyjna pacjentka E2 offline', sex: 'F', age: 30, ageMonths: 0 }, { force: true })) {
      throw new Error('Cannot seed the fictional offline patient');
    }
    document.dispatchEvent(new CustomEvent('vilda:session-changed'));
  });
}

async function selectE2(page) {
  await page.locator('#labSubstance').fill('Estradiol');
  await page.locator('#labSubstanceDropdown [data-id="estradiol"]').click();
  await page.locator('#labUnit').selectOption('pmol/L');
  await page.locator('#labUnitTarget').selectOption('pmol/L');
  await page.locator('#labValue').fill('50');
}

async function expectUnknown(page) {
  const block = page.locator('#labRangeBlock [data-reference-variants="estradiol"]');
  await expect(block).toBeVisible();
  const rows = block.locator('[data-variant-id]');
  await expect(rows).toHaveCount(4);
  expect(await rows.evaluateAll(nodes => nodes.map(node => node.dataset.reproductiveContext))).toEqual(phases);
  for (const [phase, bounds] of [['follicular', '70–290'], ['ovulation', '380–1460'], ['luteal', '200–770'], ['postmenopause', '0–110']]) {
    await expect(block.locator(`[data-reproductive-context="${phase}"] strong`)).toHaveText(`${bounds}\u00a0pmol/L`);
  }
  await expect(page.locator('#labRangeBlock .lab-range-scale, #labRangeBlock .lab-range-marker')).toHaveCount(0);
  await expect(page.locator('#labResultStatus .lab-range-status')).toHaveCount(0);
  await expect(page.locator('#labResultStatus')).not.toContainText(/w zakresie normy|poniżej normy|powyżej normy/i);
  await expect(page.locator('#labResultBig .lab-result-big-value')).not.toHaveClass(/is-normal|is-below|is-above|is-uwaga/);
  await expect(page.locator('#labRangeBlock')).not.toContainText(/w zakresie normy|poniżej normy|powyżej normy/i);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'the four alternatives fit 320 px').toBe(true);
}

async function verifyResources(page, resources, loaded) {
  for (const resource of resources) {
    expect(loaded.get(resource.url), `${resource.url} is supplied by the production SW`).toBe(true);
    const hash = await page.evaluate(async url => {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`Missing offline resource ${url}: ${response.status}`);
      const digest = await crypto.subtle.digest('SHA-256', await response.arrayBuffer());
      return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
    }, resource.url);
    expect(hash, `${resource.url} has exactly the current production bytes offline`).toBe(resource.sha256);
  }
}

for (const upgrade of [false, true]) test(`E2 unknown cycle survives ${upgrade ? 'production SW lifecycle update and ' : 'installation and '}cold offline restart at 320 px`, async ({ playwright, browserName, launchOptions }, testInfo) => {
  test.setTimeout(180_000);
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'vilda-e2-cycle-offline-'));
  const deployment = await deploymentServer(upgrade);
  const resources = resourcesFor();
  const launch = () => playwright[browserName].launchPersistentContext(directory, {
    ...launchOptions, serviceWorkers: 'allow', locale: 'pl-PL', timezoneId: 'Europe/Warsaw', viewport: { width: 320, height: 900 },
  });
  let context;
  try {
    context = await launch();
    const installer = context.pages()[0] || await context.newPage();
    await installWorker(installer, deployment.origin);
    if (upgrade) await updateWorker(installer, deployment);
    expect(deployment.workerResponses).toContainEqual({ version: deployment.version, sha256: deployment.currentWorkerHash });
    if (upgrade) expect(deployment.workerResponses).toContainEqual({ version: deployment.previousVersion, sha256: deployment.previousWorkerHash });
    await context.close();
    context = null;
    await deployment.stop();

    // The origin is physically stopped before the entire browser restarts.
    // The converter has not yet been visited: neither a loaded document nor
    // an online reference request can rescue a missing PWA dependency.
    context = await launch();
    await context.addInitScript(() => {
      localStorage.setItem('vilda-terms-accepted-v1', JSON.stringify({ version: 1, acceptedAtISO: new Date().toISOString() }));
      const now = new Date();
      const day = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
      for (const state of ['shown', 'closed']) localStorage.setItem(`vilda-reminders-${state}-v1`, `${day}|${Date.now()}`);
    });
    const page = context.pages()[0] || await context.newPage();
    const loaded = new Map();
    page.on('response', response => {
      const url = new URL(response.url());
      const resource = url.pathname + url.search;
      if (resources.some(entry => entry.url === resource)) loaded.set(resource, response.fromServiceWorker());
    });
    await page.goto(`${deployment.origin}/${converterDocument}`, { waitUntil: 'load' });
    await page.waitForFunction(() => window.LabUnitConverter && window.VildaPersistence);
    const noNetwork = () => page.evaluate(() => fetch(`/__e2-offline-probe-${Date.now()}`).then(() => false, () => true));
    expect(await noNetwork(), 'an uncached request cannot reach the stopped origin').toBe(true);
    await guest(page);
    await verifyResources(page, resources, loaded);
    await writePatient(page);
    await selectE2(page);
    await expect(page.locator('#labResultBig .lab-result-big-value')).toHaveText('50');
    await expectUnknown(page);

    await page.locator('#labUnit').selectOption('pg/mL');
    await expect(page.locator('#labResultBig .lab-result-big-value')).toHaveText('184');
    await expectUnknown(page);
    await page.locator('#labUnit').selectOption('pmol/L');
    await page.locator('#labPatientToggle').click();
    await page.locator('#labOverrideCycle').selectOption('postmenopause');
    await expect(page.locator('#labRangeBlock [data-reference-variants]')).toHaveCount(0);
    await expect(page.locator('#labResultStatus')).toContainText('w zakresie normy');
    await page.evaluate(() => document.dispatchEvent(new CustomEvent('vilda:session-changed')));
    await expect(page.locator('#labOverrideCycle')).toHaveValue('postmenopause');
    await expect(page.locator('#labResultStatus')).toContainText('w zakresie normy');
    await page.locator('#labOverrideReset').click();
    await expect(page.locator('#labOverrideCycle')).toHaveValue('');
    await expectUnknown(page);

    await page.locator('#labOverrideCycle').selectOption('follicular');
    await expect(page.locator('#labResultStatus')).toContainText('poniżej normy');
    await page.evaluate(() => {
      const patientId = 'fictional-next-e2-offline-patient';
      window._vildaCurrentPatientId = patientId;
      sessionStorage.setItem('vildaCurrentPatientId', patientId);
      document.dispatchEvent(new CustomEvent('vilda:patient-loaded', { detail: { patientId } }));
    });
    await expect(page.locator('#labOverrideCycle')).toHaveValue('');
    await expect(page.locator('#labValue')).toHaveValue('');
    await page.evaluate(() => {
      window._vildaCurrentPatientId = null;
      sessionStorage.removeItem('vildaCurrentPatientId');
      document.dispatchEvent(new CustomEvent('vilda:patient-loaded', { detail: { patientId: null } }));
    });
    await writePatient(page);
    await page.locator('#labValue').fill('50');
    await expectUnknown(page);
    await page.reload({ waitUntil: 'load' });
    await page.waitForFunction(() => window.LabUnitConverter && window.VildaPersistence);
    await selectE2(page);
    await expectUnknown(page);
    await verifyResources(page, resources, loaded);
    expect(await noNetwork(), 'the origin remains stopped after conversion, context reset, and reload').toBe(true);
    // New E2 age qualification runs from the newly installed production
    // resources after the entire browser has restarted without the origin.
    await page.evaluate(() => {
      window.VildaPersistence.writeShared({ name: 'Fikcyjny dorosły E2 offline', sex: 'M', age: 30, ageMonths: 0, tannerStage: 1 }, { force: true });
      window.dispatchEvent(new Event('focus'));
    });
    await page.locator('#labValue').fill('50');
    await expect(page.locator('#labMeta')).toContainText('40–160');
    await expect(page.locator('#labResultStatus')).toContainText('w zakresie normy');
    await page.evaluate(() => {
      window.VildaPersistence.writeShared({ name: 'Fikcyjny noworodek E2 offline', sex: 'M', age: 0, ageMonths: 0, tannerStage: 1 }, { force: true });
      window.dispatchEvent(new Event('focus'));
    });
    await expect(page.locator('#labRangeBlock')).toContainText('Brak zakresu referencyjnego estradiolu');
    await expect(page.locator('#labRangeBlock .lab-range-scale')).toHaveCount(0);
    await testInfo.attach('E2-offline-production-evidence', { body: JSON.stringify({
      baseline: upgrade ? deployment.baseline : 'fresh-current-production-install',
      previousVersion: upgrade ? deployment.previousVersion : null, version: deployment.version,
      workerResponses: deployment.workerResponses, precedingResources: deployment.precedingResources, resources,
    }, null, 2), contentType: 'application/json' });
  } finally {
    if (context) await context.close();
    await deployment.stop();
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
