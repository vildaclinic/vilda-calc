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
const modules = ['vilda_hormone_lifespan_data.js', 'vilda_hormone_lifespan_reference.js',
  'vilda_hormone_lifespan_display.js', 'vilda_hormone_lifespan.js', 'vilda_hormone_lifespan.css',
  'vilda_lab_puberty.js', 'lab_unit_converter.js'];
const panel = page => page.locator('.vilda-hormone-lifespan');
const point = page => panel(page).locator('[data-patient-concentration="lh"]');
const note = page => panel(page).locator('[data-lifespan="scale-note"]');
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const versionOf = source => /const SW_VERSION = '([^']+)'/.exec(source)[1];

function resourcesFor(tree = root) {
  const html = fs.readFileSync(path.join(tree, converterDocument));
  const scripts = [...html.toString().matchAll(/\b(?:src|href)="([^"]+)"/g)].map(match => match[1]);
  return [{ url: '/' + converterDocument, sha256: sha256(html) }, ...modules.map(name => {
    const url = scripts.find(candidate => candidate.split('?')[0] === name);
    if (!url) throw new Error(`The production converter does not load ${name}`);
    return { url: '/' + url, sha256: sha256(fs.readFileSync(path.join(tree, name))) };
  })];
}

// The normal suite checks the real SW lifecycle with a preceding SW_VERSION
// header and current assets. It does not claim to recreate an archived clinical
// release. A separate manual audit can provide an actual archived checkout via
// VILDA_LH_RESULT_ONLY_UPDATE_BASE_ROOT: then every preceding response comes from that tree,
// with its unmodified SW and old resource versions, until promotion.
async function deploymentServer(upgrade) {
  const currentWorker = fs.readFileSync(path.join(root, 'service-worker-kalorii.js'), 'utf8');
  const version = versionOf(currentWorker);
  const archive = upgrade && process.env.VILDA_LH_RESULT_ONLY_UPDATE_BASE_ROOT;
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

async function writePatient(page, age = 17, months = 0) {
  await page.evaluate(({ age, months }) => {
    if (!window.VildaPersistence.writeShared({ name: 'Fikcyjna pacjentka LH offline bez mediany', sex: 'F', age, ageMonths: months }, { force: true })) {
      throw new Error('Cannot seed the fictional offline LH patient');
    }
    document.dispatchEvent(new CustomEvent('vilda:session-changed'));
  }, { age, months });
}

async function selectLh(page) {
  await page.locator('#labSubstance').fill('LH');
  await page.locator('#labSubstanceDropdown [data-id="lh"]').click();
  await page.locator('#labUnit').selectOption('IU/L');
  await page.locator('#labUnitTarget').selectOption('IU/L');
  await page.locator('#labValue').fill('2');
}

async function expectResultOnly(page, value = 2, unit = 'IU/L') {
  const group = point(page);
  await expect(group).toHaveCount(1);
  await expect(group).toHaveAttribute('data-result-only', 'true');
  await expect(group).toHaveAttribute('data-label-unit', unit);
  await expect.poll(async () => Number(await group.getAttribute('data-value'))).toBeCloseTo(value, 10);
  for (const name of ['data-profile', 'data-reference-value', 'data-reference-statistic', 'data-median']) {
    expect(await group.getAttribute(name)).toBeNull();
  }
  await expect(group.locator('[data-median-point], [data-dot-label="median"]')).toHaveCount(0);
  await expect(note(page)).toContainText('Brak zweryfikowanej mediany dla tego wieku');
  await expect(group.locator('[data-result-overflow="above"]')).toHaveCount(value > 70 ? 1 : 0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
}

for (const upgrade of [false, true]) test(`female LH without a median survives ${upgrade ? 'production SW lifecycle update and ' : 'installation and '}cold offline restart at 320 px`, async ({ playwright, browserName, launchOptions }, testInfo) => {
  test.setTimeout(180_000);
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'vilda-female-lh-result-offline-'));
  const deployment = await deploymentServer(upgrade);
  const resources = resourcesFor();
  const launch = () => playwright[browserName].launchPersistentContext(directory, {
    ...launchOptions, serviceWorkers: 'allow', reducedMotion: 'reduce', locale: 'pl-PL',
    timezoneId: 'Europe/Warsaw', viewport: { width: 320, height: 900 },
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

    // No converter document was loaded online. Both browser process and origin
    // are stopped before the first visit, so a live page cannot mask lost assets.
    context = await launch();
    await context.addInitScript(() => {
      localStorage.setItem('vilda-terms-accepted-v1', JSON.stringify({ version: 1, acceptedAtISO: new Date().toISOString() }));
      const now = new Date();
      const day = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
      for (const state of ['shown', 'closed']) localStorage.setItem(`vilda-reminders-${state}-v1`, `${day}|${Date.now()}`);
    });
    const page = context.pages()[0] || await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    const loaded = new Map();
    page.on('response', response => {
      const url = new URL(response.url());
      const resource = url.pathname + url.search;
      if (resources.some(entry => entry.url === resource)) loaded.set(resource, response.fromServiceWorker());
    });
    await page.goto(`${deployment.origin}/${converterDocument}`, { waitUntil: 'load' });
    await page.waitForFunction(() => window.LabUnitConverter && window.VildaPersistence && window.VildaHormoneLifespanRuntime);
    const noNetwork = () => page.evaluate(() => fetch(`/__lh-offline-probe-${Date.now()}`).then(() => false, () => true));
    expect(await noNetwork(), 'an uncached request cannot reach the physically stopped origin').toBe(true);
    await guest(page);
    await verifyResources(page, resources, loaded);
    await writePatient(page);
    await selectLh(page);
    await expectResultOnly(page);
    const assessment = await page.evaluate(() => window.VildaLabPubertyRuntime.getAssessment());
    const shared = await page.evaluate(() => window.VildaPersistence.readShared());
    const geometry = () => panel(page).locator('[data-period-hormone="lh"]').evaluateAll(nodes => nodes.map(node => ({
      d: node.getAttribute('d'), divisor: node.dataset.divisor, ceiling: node.dataset.ceiling,
    })));
    const original = await geometry();
    expect(original.length).toBeGreaterThan(0);
    for (const value of [0, 1000, 2]) {
      await page.locator('#labValue').fill(String(value));
      await expectResultOnly(page, value);
      expect(await geometry()).toEqual(original);
    }
    for (const raw of ['', '<2']) {
      await page.locator('#labValue').fill(raw);
      await expect(point(page)).toHaveCount(0);
      expect(await geometry()).toEqual(original);
    }
    await page.locator('#labUnit').selectOption('mIU/mL');
    await page.locator('#labValue').fill('2');
    await expectResultOnly(page, 2, 'mIU/mL');
    await page.locator('#labUnit').selectOption('IU/L');
    await expectResultOnly(page);
    await panel(page).locator('[data-view="puberty"]').click();
    await expect(point(page)).toHaveCount(0);
    await expect(note(page)).toContainText('6–16 lat');
    await expect(note(page)).toContainText('Całym życiu');
    await expect(note(page)).not.toContainText('Wynik i odniesienie zobaczysz');
    await panel(page).locator('[data-view="life"]').click();
    await expectResultOnly(page);
    await panel(page).getByText('O wykresie i źródła', { exact: true }).click();
    for (const name of ['Zhao', 'Assens', 'Wiedemann']) {
      await expect(panel(page).locator('[data-lifespan="source-copy"]')).toContainText(name);
    }
    expect(await page.evaluate(() => window.VildaLabPubertyRuntime.getAssessment())).toEqual(assessment);
    expect(await page.evaluate(() => window.VildaPersistence.readShared())).toEqual(shared);
    const screenshot = testInfo.outputPath('female-lh-result-only-offline-320.png');
    await panel(page).screenshot({ path: screenshot });
    await testInfo.attach('female-LH-offline-screenshot', { path: screenshot, contentType: 'image/png' });
    await page.reload({ waitUntil: 'load' });
    await page.waitForFunction(() => window.LabUnitConverter && window.VildaPersistence && window.VildaHormoneLifespanRuntime);
    await selectLh(page);
    await expectResultOnly(page);
    await verifyResources(page, resources, loaded);
    expect(await noNetwork(), 'the origin stays stopped through unit changes and reload').toBe(true);
    expect(errors).toEqual([]);
    const evidence = testInfo.outputPath('female-lh-result-only-offline-evidence.json');
    fs.writeFileSync(evidence, JSON.stringify({
      baseline: upgrade ? deployment.baseline : 'fresh-current-production-install',
      previousVersion: upgrade ? deployment.previousVersion : null, version: deployment.version,
      workerResponses: deployment.workerResponses, precedingResources: deployment.precedingResources, resources,
    }, null, 2));
    await testInfo.attach('female-LH-offline-production-evidence', { path: evidence, contentType: 'application/json' });
  } finally {
    if (context) await context.close();
    await deployment.stop();
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
