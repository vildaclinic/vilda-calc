import { createServer } from 'node:http';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';
import { expectResult, restore } from '../support/protein-dzm.mjs';
import { enterGuest, prepareBrowser, installMemoryVault, saveVisible, memory } from '../support/klirens-patient-record.mjs';

test.use({ serviceWorkers: 'allow', actionTimeout: 15_000 });
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const versionOf = source => /const SW_VERSION = '([^']+)'/.exec(source)[1];
const names = [
  'clcr_protein_dzm_data.js', 'clcr_protein_dzm.js', 'clcr_protein_dzm_ui.js',
  'clcr_protein_dzm.css', 'clcr_protein_dzm_persistence.js',
  'clcr_collection_duration.js', 'clcr_collection_duration.css',
  'clcr_ca_dzm.js', 'clcr_ca_dzm_ui.js', 'clcr_ua.js', 'clcr_ua_ui.js',
  'clcr_notes_view.js', 'clcr_notes_view.css', 'clcr_record_resources.js',
  'clcr_ui_workflow.js', 'clcr_ui_workflow.css', 'vilda_auth_ui.js', 'vilda_lab_history_tab.js',
  'clcr_saved_calculation.js', 'clcr_saved_results.js', 'clcr_result_details.js',
  'clcr_saved_legacy_calculator.js', 'inline_kalkulator_klirens_02.js',
  'inline_kalkulator_klirens_04.js', 'inline_kalkulator_klirens_07.js',
];

function resourcesFor(tree = root, preceding = false) {
  const html = fs.readFileSync(path.join(tree, 'kalkulator-klirens.html'));
  const sources = [html.toString(), ...['clcr_record_resources.js', 'vilda_auth_ui.js', 'vilda_lab_history_tab.js'].flatMap(name =>
    fs.existsSync(path.join(tree, name)) ? [fs.readFileSync(path.join(tree, name), 'utf8')] : [])];
  const loaded = sources.flatMap(source => [...source.matchAll(/["']([^"'\s]+\.(?:js|css)\?v=\d+)["']/g)].map(match => match[1]));
  return [{ url: '/kalkulator-klirens.html', sha256: sha256(html) }, ...names.flatMap(name => {
    const url = loaded.find(value => value.split('?')[0] === name);
    if (preceding && !fs.existsSync(path.join(tree, name))) return [];
    if (!url) throw new Error(`Brak produkcyjnego adresu zasobu ${name}`);
    return [{ url: '/' + url, sha256: sha256(fs.readFileSync(path.join(tree, name))) }];
  })];
}

// With VILDA_PROTEIN_DZM_UPDATE_BASE_ROOT, all preceding responses are bytes from an
// unmodified archived production tree. The normal suite otherwise tests the
// real SW lifecycle with current assets and only the preceding version header;
// it does not claim to recreate the older clinical implementation.
async function deploymentServer(upgrade) {
  const currentWorker = fs.readFileSync(path.join(root, 'service-worker-kalorii.js'), 'utf8');
  const version = versionOf(currentWorker);
  const archive = upgrade && process.env.VILDA_PROTEIN_DZM_UPDATE_BASE_ROOT;
  const previousRoot = archive ? path.resolve(archive) : root;
  const pieces = version.split('.').map(Number);
  pieces[pieces.length - 1] -= 1;
  const previousWorker = archive ? fs.readFileSync(path.join(previousRoot, 'service-worker-kalorii.js'), 'utf8')
    : currentWorker.replace(`const SW_VERSION = '${version}'`, `const SW_VERSION = '${pieces.join('.')}'`);
  const previousVersion = versionOf(previousWorker);
  if (upgrade && version === previousVersion) throw new Error('Aktualizacja wymaga różnych rzeczywistych wersji SW');
  const precedingResources = upgrade ? resourcesFor(previousRoot, true) : [];
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
    precedingResources,
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
    if (url.origin === origin && !url.pathname.startsWith('/__protein-dzm-offline-probe-')) failed.push(request.url());
    else if (url.origin !== origin) externalFailed.push({ url: request.url(), error: request.failure()?.errorText || '' });
  });
  page.on('pageerror', error => errors.push(error.message));
  await prepareBrowser(page);
  await page.goto(origin + '/kalkulator-klirens.html', { waitUntil: 'load' });
  await page.waitForFunction(() => window.VildaVault && window.ClcrUiWorkflow && window.VildaClcrProteinDzm && window.ClcrCollectionDuration);
  await enterGuest(page, { calculator: true });
  expect(await page.evaluate(() => new URL(navigator.serviceWorker.controller.scriptURL).pathname)).toBe('/service-worker-kalorii.js');
  expect(await page.evaluate(() => fetch(`/__protein-dzm-offline-probe-${Date.now()}`).then(() => false, () => true)), 'Fizycznie wyłączony serwer nie odpowiada').toBe(true);
  return { page, failed, externalFailed, errors, loaded };
}

async function assertResourceDelivery(page, resources, loaded) {
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
}

async function fictionalProteinAndNotes(page) {
  const samples = [];
  for (const sample of [
    { label: 'child-high-default24', fields: { Prot_collectionHours: '' }, expected: {} },
    { label: 'adult-within', fields: { age: '45', Prot_inputMode: 'reported', Prot_reportedValue: '100' }, expected: { raw: 100, status: 'within', tone: 'normal' } },
    { label: 'explicit12-estimate', fields: { Prot_collectionHours: '12' }, expected: { raw: 600, status: 'unassessed', tone: 'neutral', reference: false } },
    { label: 'tiny-positive', fields: { Prot_concentration: '0.01' }, expected: { raw: 0.015, status: 'within', tone: 'normal' } },
    { label: 'zero-neutral', fields: { Prot_concentration: '0' }, expected: { raw: 0, status: 'zero', tone: 'neutral', reference: false } },
  ]) {
    await restore(page, sample.fields);
    const result = await expectResult(page, sample.expected);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    samples.push({ label: sample.label, result });
  }
  // Select the fictional saved patient before entering a new measurement;
  // never attach an already-entered guest result across the patient guard.
  await page.locator('#clearBtn').click(); await page.waitForFunction(() => window.clcrIsResetting !== true);
  await installMemoryVault(page); await restore(page); await expectResult(page, { guest: false });
  const [note] = await saveVisible(page, '2026-10-29');
  expect((await memory(page)).notes).toHaveLength(1);
  expect(note.labResult.valueNum).toBe(300); expect(note.labResult.value).toBe('300');
  await page.locator('#clcrOpenBadaniaBtn').click(); await expect(page.locator('.vilda-auth-patient-card')).toBeVisible();
  await page.locator('button[data-tab="notes"]').click();
  const compact = page.locator('.vilda-clcr-note[data-clcr-note-state="ready"]'); await expect(compact).toHaveCount(1);
  await expect(compact.locator('.clcr-note-value')).toHaveText('300'); await expect(compact.locator('.clcr-note-reference')).toHaveText('<150');
  for (const key of ['VILDA_CLCR', 'engineVersion', 'exactMain', '[tekst]']) await expect(compact).not.toContainText(key);
  expect(await compact.evaluate(node => node.scrollWidth <= node.clientWidth + 1)).toBe(true);
  await compact.getByRole('button', { name: 'Szczegóły obliczenia →', exact: true }).click();
  await expect(page.locator('#calculationDetails')).toHaveAttribute('data-note-id', note.id);
  await page.locator('#editMeasurement').click(); await page.locator('#editField-Prot_concentration').fill('400');
  await page.locator('#saveEditedMeasurement').click(); await expect(page.locator('#editDialog')).toBeHidden();
  const edited = (await memory(page)).notes.find(item => item.id === note.id);
  expect(edited.labResult.valueNum).toBe(600); expect(edited.id).toBe(note.id);
  await page.locator('#detailsDialog').getByRole('button', { name: 'Zamknij', exact: true }).click();
  await expect(compact.locator('.clcr-note-value')).toHaveText('600');
  const reread = await page.evaluate(value => window.ClcrSavedResults.projectPatientNotes([value]).measurements[0], edited);
  expect(reread.valueNum).toBe(600); expect((await memory(page)).originalsLocked).toBe(true);
  return { samples, note: { value: note.labResult.value, unit: note.labResult.unit, category: note.category, editedValue: edited.labResult.valueNum, rereadValue: reread.valueNum } };
}

for (const upgrade of [false, true]) {
  test(`Białko DZM/Notes: ${upgrade ? 'aktualizacja produkcyjnego SW' : 'pełna świeża instalacja'} i dwa zimne starty offline przed pierwszą wizytą`, async ({ playwright, browserName, launchOptions }, testInfo) => {
    test.setTimeout(180_000);
    const resources = resourcesFor();
    const deployment = await deploymentServer(upgrade);
    const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'vilda-protein-dzm-offline-'));
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
        const result = await fictionalProteinAndNotes(offline.page);
        await assertResourceDelivery(offline.page, resources, offline.loaded);
        if (previous) expect(result).toEqual(previous); else previous = result;
        expect(offline.failed, 'Brak utraconych zasobów aplikacji').toEqual([]);
        expect(offline.errors).toEqual([]);
        proof.offlinePages.push({ result, failedApplicationRequests: offline.failed, externalRequestFailures: offline.externalFailed, pageErrors: offline.errors });
        await context.close(); context = null;
      }
      expect(resourcesFor(), 'Źródła nie zmieniły się w trakcie próby').toEqual(resources);
      const proofPath = testInfo.outputPath('protein-notes-production-offline-proof.json');
      fs.writeFileSync(proofPath, JSON.stringify(proof, null, 2));
      await testInfo.attach('protein-notes-production-offline-proof', { path: proofPath, contentType: 'application/json' });
    } finally {
      if (context) await context.close();
      await deployment.stop();
      fs.rmSync(profile, { recursive: true, force: true });
    }
  });
}
