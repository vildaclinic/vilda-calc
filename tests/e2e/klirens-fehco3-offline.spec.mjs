import { createServer } from 'node:http';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';
import { card, details, enterGuest, expectBlocked, expectResult, restore } from '../support/klirens-fehco3.mjs';

test.use({ serviceWorkers: 'allow' });
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const versionOf = source => /const SW_VERSION = '([^']+)'/.exec(source)[1];
const names = ['clcr_fehco3_reference_data.js', 'clcr_fehco3.js', 'clcr_fehco3_ui.js', 'clcr_fehco3_ui.css', 'clcr_fehco3_persistence.js',
  'clcr_ui_workflow.js', 'clcr_clinical_safety.js', 'clcr_result_presentation.js', 'inline_kalkulator_klirens_02.js',
  'inline_kalkulator_klirens_04.js', 'inline_kalkulator_klirens_07.js'];

function resourcesFor(tree = root, preceding = false) {
  const html = fs.readFileSync(path.join(tree, 'kalkulator-klirens.html'));
  const loaded = [...html.toString().matchAll(/(?:src|href)="([^"]+)"/g)].map(match => match[1]);
  return [{ url: '/kalkulator-klirens.html', sha256: sha256(html) }, ...names.flatMap(name => {
    const url = loaded.find(value => value.split('?')[0] === name);
    if (!url && preceding && name.startsWith('clcr_fehco3')) return [];
    if (!url) throw new Error(`Klirens nie ładuje ${name}`);
    return [{ url: '/' + url, sha256: sha256(fs.readFileSync(path.join(tree, name))) }];
  })];
}

// With VILDA_FEHCO3_UPDATE_BASE_ROOT, all preceding responses are bytes from an
// unmodified archived production tree. The normal suite otherwise tests the
// real SW lifecycle with current assets and only the preceding version header;
// it does not claim to recreate the older clinical implementation.
async function deploymentServer(upgrade) {
  const currentWorker = fs.readFileSync(path.join(root, 'service-worker-kalorii.js'), 'utf8');
  const version = versionOf(currentWorker);
  const archive = upgrade && process.env.VILDA_FEHCO3_UPDATE_BASE_ROOT;
  const previousRoot = archive ? path.resolve(archive) : root;
  const pieces = version.split('.').map(Number);
  pieces[pieces.length - 1] -= 1;
  const previousWorker = archive ? fs.readFileSync(path.join(previousRoot, 'service-worker-kalorii.js'), 'utf8')
    : currentWorker.replace(`const SW_VERSION = '${version}'`, `const SW_VERSION = '${pieces.join('.')}'`);
  const previousVersion = versionOf(previousWorker);
  if (upgrade && version === previousVersion) throw new Error('Aktualizacja wymaga różnych rzeczywistych wersji SW');
  let promoted = !upgrade, calculatorNavigations = 0, stopped = false;
  const workerResponses = [];
  const types = { '.html': 'text/html', '.js': 'application/javascript', '.mjs': 'application/javascript',
    '.json': 'application/json', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png' };
  const server = createServer((request, response) => {
    const pathname = decodeURIComponent(new URL(request.url, 'http://127.0.0.1').pathname);
    if (pathname === '/service-worker-kalorii.js') {
      const bytes = promoted ? currentWorker : previousWorker;
      workerResponses.push({ version: versionOf(bytes), sha256: sha256(bytes) });
      response.writeHead(200, { 'Content-Type': 'application/javascript', 'Cache-Control': 'no-store', 'Service-Worker-Allowed': '/' });
      response.end(bytes);
      return;
    }
    if (pathname === '/kalkulator-klirens.html' && request.headers['sec-fetch-dest'] === 'document') calculatorNavigations += 1;
    const tree = promoted ? root : previousRoot;
    const absolute = path.resolve(tree, '.' + (pathname === '/' ? '/index.html' : pathname));
    if (!absolute.startsWith(tree + path.sep)) { response.writeHead(403).end(); return; }
    fs.readFile(absolute, (error, bytes) => {
      if (error) { response.writeHead(404).end(); return; }
      response.writeHead(200, { 'Content-Type': types[path.extname(absolute)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
      response.end(bytes);
    });
  });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  return { origin: `http://127.0.0.1:${server.address().port}`, version, previousVersion,
    baseline: archive ? 'archived-unmodified-production-tree' : 'current-assets-with-preceding-version-header',
    precedingResources: upgrade ? resourcesFor(previousRoot, true) : [],
    currentWorkerHash: sha256(currentWorker), previousWorkerHash: sha256(previousWorker), workerResponses,
    promote: () => { promoted = true; }, navigations: () => calculatorNavigations,
    stop: () => new Promise(resolve => {
      if (stopped) { resolve(); return; }
      stopped = true; server.close(resolve); server.closeAllConnections();
    }) };
}

async function cacheHashes(page, version, resources) {
  return page.evaluate(async ({ version, resources }) => {
    const cache = await caches.open(`pwa-kalorii-shell-v${version}`);
    return Promise.all(resources.map(async ({ url }) => {
      const response = await cache.match(url);
      if (!response?.ok) throw new Error(`Brak w pełnym produkcyjnym precache: ${url}`);
      const bytes = await crypto.subtle.digest('SHA-256', await response.arrayBuffer());
      return { url, sha256: [...new Uint8Array(bytes)].map(x => x.toString(16).padStart(2, '0')).join('') };
    }));
  }, { version, resources });
}

async function installWorker(page, origin) {
  await page.goto(origin + '/tests/fixtures/service-worker-runner.html');
  const state = await page.evaluate(async () => {
    const registration = await navigator.serviceWorker.register('/service-worker-kalorii.js', { scope: '/' });
    const worker = registration.installing || registration.waiting || registration.active;
    if (!['activated', 'redundant'].includes(worker.state)) await new Promise(resolve => {
      worker.addEventListener('statechange', () => { if (['activated', 'redundant'].includes(worker.state)) resolve(); });
    });
    return worker.state;
  });
  expect(state).toBe('activated');
}

async function updateWorker(page, deployment) {
  expect(await cacheHashes(page, deployment.previousVersion, deployment.precedingResources)).toEqual(deployment.precedingResources);
  deployment.promote();
  const state = await page.evaluate(async () => {
    const registration = await navigator.serviceWorker.getRegistration('/');
    const previous = registration.active;
    await registration.update();
    const worker = registration.installing || registration.waiting;
    if (!worker || worker === previous) throw new Error('Nie uruchomiono nowej instalacji produkcyjnego SW');
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
}

async function offlinePage(context, origin, resources) {
  const page = context.pages()[0] || await context.newPage();
  const loaded = new Map(), failed = [], externalFailed = [], errors = [];
  page.on('response', response => {
    const url = new URL(response.url()), key = url.pathname + url.search;
    if (resources.some(resource => resource.url === key)) loaded.set(key, response.fromServiceWorker());
  });
  page.on('requestfailed', request => {
    const url = new URL(request.url());
    if (url.origin === origin && !url.pathname.startsWith('/__fehco3-offline-probe-')) failed.push(request.url());
    else if (url.origin !== origin) externalFailed.push({ url: request.url(), error: request.failure()?.errorText || '' });
  });
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(origin + '/kalkulator-klirens.html', { waitUntil: 'load' });
  await page.waitForFunction(() => window.VildaVault && window.ClcrUiWorkflow && window.VildaClcrFehco3);
  await enterGuest(page);
  expect(await page.evaluate(() => new URL(navigator.serviceWorker.controller.scriptURL).pathname)).toBe('/service-worker-kalorii.js');
  expect(await page.evaluate(() => fetch(`/__fehco3-offline-probe-${Date.now()}`).then(() => false, () => true)), 'Fizycznie wyłączony serwer nie odpowiada').toBe(true);
  for (const resource of resources) {
    expect(loaded.get(resource.url), resource.url + ' dostarcza produkcyjny SW').toBe(true);
    const digest = await page.evaluate(async url => {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`Brak odpowiedzi offline: ${url}`);
      const bytes = await crypto.subtle.digest('SHA-256', await response.arrayBuffer());
      return [...new Uint8Array(bytes)].map(x => x.toString(16).padStart(2, '0')).join('');
    }, resource.url);
    expect(digest, resource.url).toBe(resource.sha256);
  }
  return { page, failed, externalFailed, errors };
}

async function fictionalFehco3(page) {
  const cases = [
    { label: 'child', fields: {}, raw: 0.5, display: '0,5' },
    { label: 'adult', fields: { age: '45' }, raw: 0.5, display: '0,5' },
    { label: 'no-age-small', fields: { age: '', U_HCO3_spot: '0.024' }, raw: 0.001, display: '0,001' },
    { label: 'near-presentation-point', fields: { U_HCO3_spot: '360.0024' }, raw: 15.0001, display: '15,0001' },
    { label: 'mixed-units', fields: { Ucr_spot: '8.84', Ucr_spot_unit: 'mmol/L', Scr_spot: '88.4', Scr_spot_unit: 'umol' }, raw: 0.5, display: '0,5' },
    { label: 'true-zero', fields: { U_HCO3_spot: '0' }, raw: 0, display: '0' },
    { label: 'known-cautions', fields: { spotDiureticUse: true, ui_spotDiureticUse_answer: 'yes', spotKnownCKD: true, ui_spotKnownCKD_answer: 'yes' }, raw: 0.5, display: '0,5', tone: 'warning' },
  ];
  const observed = [];
  for (const sample of cases) {
    await restore(page, sample.fields);
    const assessment = await expectResult(page, { raw: sample.raw, tone: sample.tone || 'neutral' });
    expect(assessment.display.text).toBe(sample.display);
    await expect(card(page)).toContainText('Brak normy do porównania');
    await expect(card(page)).not.toContainText(/W normie|W zakresie dla wieku/);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    if (sample.tone) expect(assessment.knownFacts).toMatchObject({ diureticUse: true, knownCKD: true });
    observed.push({ label: sample.label, assessment });
  }
  await restore(page, { FENa_sample_status: 'different-time' });
  await expectBlocked(page);
  await restore(page);
  const sourceDetails = details(page);
  if (await sourceDetails.getAttribute('open') === null) await sourceDetails.locator(':scope > summary').click();
  await expect(sourceDetails).toContainText('Yaxley');
  await expect(sourceDetails.locator('a[href*="ochsnerjournal.org/content/16/4/525"]')).toHaveCount(1);
  await expect(page.locator('#fehco3RequiredCount')).toHaveText('4/4');
  return observed;
}

for (const upgrade of [false, true]) {
  test(`FEHCO3: ${upgrade ? 'aktualizacja produkcyjnego SW' : 'pełna świeża instalacja'} i dwa zimne starty offline przed pierwszą wizytą`, async ({ playwright, browserName, launchOptions }, testInfo) => {
    test.setTimeout(180_000);
    const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'vilda-fehco3-offline-'));
    const deployment = await deploymentServer(upgrade);
    const resources = resourcesFor();
    const launch = () => playwright[browserName].launchPersistentContext(profile, {
      ...launchOptions, serviceWorkers: 'allow', locale: 'pl-PL', timezoneId: 'Europe/Warsaw',
      reducedMotion: 'reduce', viewport: { width: 320, height: 1000 },
    });
    let context;
    const proof = { baseline: upgrade ? deployment.baseline : 'fresh-current-production-install',
      workerVersion: deployment.version, previousVersion: upgrade ? deployment.previousVersion : null,
      resources, precacheBeforeFirstCalculatorVisit: true, coldBrowserRestarts: 2, offlinePages: [] };
    try {
      context = await launch();
      const installer = context.pages()[0] || await context.newPage();
      await installWorker(installer, deployment.origin);
      if (upgrade) await updateWorker(installer, deployment);
      proof.precache = await cacheHashes(installer, deployment.version, resources);
      expect(proof.precache).toEqual(resources);
      expect(deployment.workerResponses).toContainEqual({ version: deployment.version, sha256: deployment.currentWorkerHash });
      if (upgrade) expect(deployment.workerResponses).toContainEqual({ version: deployment.previousVersion, sha256: deployment.previousWorkerHash });
      proof.calculatorNavigationsBeforeStop = deployment.navigations();
      expect(proof.calculatorNavigationsBeforeStop).toBe(0);
      await context.close(); context = null;
      await deployment.stop();
      let previous;
      for (let index = 0; index < 2; index += 1) {
        context = await launch();
        await context.setOffline(true);
        await context.addInitScript(() => {
          localStorage.setItem('vilda-terms-accepted-v1', JSON.stringify({ version: 1, acceptedAtISO: new Date().toISOString() }));
        });
        const offline = await offlinePage(context, deployment.origin, resources);
        const result = await fictionalFehco3(offline.page);
        if (previous) expect(result).toEqual(previous); else previous = result;
        expect(offline.failed, 'Brak utraconych zasobów aplikacji').toEqual([]);
        expect(offline.errors).toEqual([]);
        proof.offlinePages.push({ result, failedApplicationRequests: offline.failed, externalRequestFailures: offline.externalFailed, pageErrors: offline.errors });
        await context.close(); context = null;
      }
      expect(resourcesFor(), 'Źródła nie zmieniły się w trakcie próby').toEqual(resources);
      const proofPath = testInfo.outputPath('fehco3-production-offline-proof.json');
      fs.writeFileSync(proofPath, JSON.stringify(proof, null, 2));
      await testInfo.attach('fehco3-production-offline-proof', { path: proofPath, contentType: 'application/json' });
    } finally {
      if (context) await context.close();
      await deployment.stop();
      fs.rmSync(profile, { recursive: true, force: true });
    }
  });
}
