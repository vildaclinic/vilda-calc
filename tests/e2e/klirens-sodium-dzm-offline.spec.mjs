import { createServer } from 'node:http';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';
import { expectResult, restore } from '../support/sodium-dzm.mjs';
import { enterGuest, prepareBrowser, installMemoryVault, saveVisible, memory } from '../support/klirens-patient-record.mjs';

test.use({ serviceWorkers: 'allow', actionTimeout: 15_000 });
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const versionOf = source => /const SW_VERSION = '([^']+)'/.exec(source)[1];
const UPDATE_BASE_SHA = 'e49ff33eef89db636926666557f1c40380430eb5';
const names = [
  'clcr_sodium_dzm_data.js', 'clcr_sodium_dzm.js', 'clcr_sodium_dzm_ui.js',
  'clcr_sodium_dzm.css', 'clcr_sodium_dzm_persistence.js',
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

// The update must use an actual production tree. A fabricated preceding SW
// header over current bytes cannot detect a missing newly introduced module.
function productionBaseline() {
  const supplied = process.env.VILDA_SODIUM_DZM_UPDATE_BASE_ROOT;
  if (supplied) return { directory: path.resolve(supplied), cleanup() {} };
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'vilda-sodium-dzm-production-base-'));
  try {
    execFileSync('git', ['cat-file', '-e', `${UPDATE_BASE_SHA}^{tree}`], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] });
    const bytes = execFileSync('git', ['archive', '--format=tar', UPDATE_BASE_SHA], { cwd: root, maxBuffer: 128 * 1024 * 1024 });
    execFileSync('tar', ['-x', '-C', directory], { input: bytes });
    return { directory, cleanup: () => fs.rmSync(directory, { recursive: true, force: true }) };
  } catch (error) {
    fs.rmSync(directory, { recursive: true, force: true });
    throw new Error(`Brak rzeczywistej produkcyjnej bazy ${UPDATE_BASE_SHA}; pobierz jej historię Git lub ustaw VILDA_SODIUM_DZM_UPDATE_BASE_ROOT.`, { cause: error });
  }
}

async function deploymentServer(upgrade) {
  const currentWorker = fs.readFileSync(path.join(root, 'service-worker-kalorii.js'), 'utf8');
  const version = versionOf(currentWorker);
  const baseline = upgrade ? productionBaseline() : null;
  const previousRoot = baseline?.directory || root;
  const previousWorker = upgrade ? fs.readFileSync(path.join(previousRoot, 'service-worker-kalorii.js'), 'utf8') : currentWorker;
  const previousVersion = versionOf(previousWorker);
  if (upgrade && version === previousVersion) { baseline.cleanup(); throw new Error('Aktualizacja wymaga różnych rzeczywistych wersji SW'); }
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
    baseline: 'archived-unmodified-production-tree', baselineSha: upgrade ? UPDATE_BASE_SHA : null,
    cleanup: () => baseline?.cleanup(),
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
    if (url.origin === origin && !url.pathname.startsWith('/__sodium-dzm-offline-probe-')) failed.push(request.url());
    else if (url.origin !== origin) externalFailed.push({ url: request.url(), error: request.failure()?.errorText || '' });
  });
  page.on('pageerror', error => errors.push(error.message));
  await prepareBrowser(page);
  await page.goto(origin + '/kalkulator-klirens.html', { waitUntil: 'load' });
  await page.waitForFunction(() => window.VildaVault && window.ClcrUiWorkflow && window.VildaClcrSodiumDzm && window.ClcrCollectionDuration);
  await enterGuest(page, { calculator: true });
  expect(await page.evaluate(() => new URL(navigator.serviceWorker.controller.scriptURL).pathname)).toBe('/service-worker-kalorii.js');
  expect(await page.evaluate(() => fetch(`/__sodium-dzm-offline-probe-${Date.now()}`).then(() => false, () => true)), 'Fizycznie wyłączony serwer nie odpowiada').toBe(true);
  return { page, failed, externalFailed, errors, loaded };
}

async function assertResourceDelivery(page, resources, loaded, { alreadyLoaded = true } = {}) {
  for (const resource of resources) {
    if (alreadyLoaded) expect(loaded.get(resource.url), resource.url + ' dostarcza produkcyjny SW').toBe(true);
    const digest = await page.evaluate(async url => {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`Brak odpowiedzi offline: ${url}`);
      const bytes = await crypto.subtle.digest('SHA-256', await response.arrayBuffer());
      return [...new Uint8Array(bytes)].map(x => x.toString(16).padStart(2, '0')).join('');
    }, resource.url);
    expect(digest, resource.url).toBe(resource.sha256);
    expect(loaded.get(resource.url), resource.url + ' odpowiada przez produkcyjny SW').toBe(true);
  }
}

async function fictionalSodiumAndNotes(page) {
  const samples = [];
  for (const sample of [
    { label: 'adult-normal-default24', fields: {}, expected: {} },
    { label: 'child-female-range', fields: { age: '10', sex: 'F' }, expected: {} },
    { label: 'explicit12-estimate', fields: { Na_collectionHours: '12' }, expected: { raw: 300, status: 'unassessed', tone: 'neutral', reference: false } },
    { label: 'tiny-positive', fields: { Na_concentration: '0.01' }, expected: { raw: 0.015, status: 'low', tone: 'warning' } },
    { label: 'zero-neutral', fields: { Na_concentration: '0' }, expected: { raw: 0, status: 'zero', tone: 'neutral', reference: false, available: true } },
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
  const [note] = await saveVisible(page, '2026-10-30');
  expect((await memory(page)).notes).toHaveLength(1);
  expect(note.labResult.valueNum).toBe(150); expect(note.labResult.value).toBe('150');
  await page.locator('#clcrOpenBadaniaBtn').click(); await expect(page.locator('.vilda-auth-patient-card')).toBeVisible();
  await page.locator('button[data-tab="notes"]').click();
  const compact = page.locator('.vilda-clcr-note[data-clcr-note-state="ready"]'); await expect(compact).toHaveCount(1);
  await expect(compact.locator('.clcr-note-value')).toHaveText('150'); await expect(compact.locator('.clcr-note-reference')).toHaveText('58–337');
  for (const key of ['VILDA_CLCR', 'engineVersion', 'exactMain', '[tekst]']) await expect(compact).not.toContainText(key);
  expect(await compact.evaluate(node => node.scrollWidth <= node.clientWidth + 1)).toBe(true);
  await compact.getByRole('button', { name: 'Szczegóły obliczenia →', exact: true }).click();
  await expect(page.locator('#calculationDetails')).toHaveAttribute('data-note-id', note.id);
  await page.locator('#editMeasurement').click(); await page.locator('#editField-Na_concentration').fill('200');
  await page.locator('#saveEditedMeasurement').click(); await expect(page.locator('#editDialog')).toBeHidden();
  const edited = (await memory(page)).notes.find(item => item.id === note.id);
  expect(edited.labResult.valueNum).toBe(300); expect(edited.id).toBe(note.id);
  await page.locator('#detailsDialog').getByRole('button', { name: 'Zamknij', exact: true }).click();
  await expect(compact.locator('.clcr-note-value')).toHaveText('300');
  const reread = await page.evaluate(value => window.ClcrSavedResults.projectPatientNotes([value]).measurements[0], edited);
  expect(reread.valueNum).toBe(300); expect((await memory(page)).originalsLocked).toBe(true);
  return { samples, note: { value: note.labResult.value, unit: note.labResult.unit, category: note.category, editedValue: edited.labResult.valueNum, rereadValue: reread.valueNum } };
}

async function lazyStartAndNotes(page, origin, note, resources, loaded) {
  // A new production Start document has no heavy calculator imports. The
  // patient's card must lazily obtain all Sodium resources from the same SW.
  loaded.clear();
  await page.goto(origin + '/index.html', { waitUntil: 'load' });
  await enterGuest(page); await installMemoryVault(page);
  await page.evaluate(value => window.__clcrRecordFixture.seed([value]), note);
  await page.evaluate(pid => window.VildaAuthUI.showPatientCard(pid, null, null, { activeTab: 'notes' }), note.patientId);
  const compact = page.locator('.vilda-clcr-note[data-clcr-note-state="ready"]');
  await expect(compact).toHaveCount(1); await expect(compact.locator('.clcr-note-value')).toHaveText('300');
  await page.waitForFunction(() => Boolean(window.VildaClcrSodiumDzm && window.ClcrSodiumDzmPersistence));
  await compact.getByRole('button', { name: 'Szczegóły obliczenia →', exact: true }).click();
  await page.locator('#editMeasurement').click(); await page.locator('#editField-Na_concentration').fill('400');
  await page.locator('#saveEditedMeasurement').click(); await expect(page.locator('#editDialog')).toBeHidden();
  const edited = (await memory(page)).notes.find(value => value.id === note.id);
  expect(edited.id).toBe(note.id); expect(edited.labResult.valueNum).toBe(600);
  await page.locator('#detailsDialog').getByRole('button', { name: 'Zamknij', exact: true }).click();
  await expect(compact.locator('.clcr-note-value')).toHaveText('600');
  const saved = await page.evaluate(value => {
    const engine = window.VildaClcrSodiumDzm;
    window.VildaClcrSodiumDzm = new Proxy({}, { get() { return () => { throw new Error('Offline Start history must remain frozen'); }; } });
    try { return window.ClcrSavedResults.projectPatientNotes([value]).measurements[0]; }
    finally { window.VildaClcrSodiumDzm = engine; }
  }, edited);
  expect(saved).toMatchObject({ valueNum: 600, outOfRange: true });
  await compact.getByRole('button', { name: 'Zobacz w Badaniach →', exact: true }).click();
  await expect(page.locator(`.vilda-lab-hist-panel[data-panel="renal"] .vilda-clcr-point[data-note-id="${note.id}"]`)).toHaveAttribute('data-value', '600');
  const lazyResources = resources.filter(resource => /\/(?:clcr_sodium_dzm(?:_data|_persistence)?\.js|clcr_record_resources\.js|clcr_saved_calculation\.js|clcr_saved_results\.js|clcr_result_details\.js|vilda_auth_ui\.js|vilda_lab_history_tab\.js)\?/.test(resource.url));
  expect(lazyResources.filter(resource => resource.url.includes('/clcr_sodium_dzm'))).toHaveLength(3);
  await assertResourceDelivery(page, lazyResources, loaded);
  // The calculator-only UI/CSS should remain available from the same full
  // precache without importing an unused calculator form into Start.
  const calculatorResources = resources.filter(resource => /\/clcr_sodium_dzm(?:_ui\.js|\.css)\?/.test(resource.url));
  expect(calculatorResources).toHaveLength(2);
  await assertResourceDelivery(page, calculatorResources, loaded, { alreadyLoaded: false });
  expect((await memory(page)).originalsLocked).toBe(true);
  return { editedValue: edited.labResult.valueNum, frozenValue: saved.valueNum, norm: saved.norm, resources: [...lazyResources, ...calculatorResources] };
}

for (const upgrade of [false, true]) {
  test(`Sód DZM/Notes: ${upgrade ? 'aktualizacja produkcyjnego SW' : 'pełna świeża instalacja'} i dwa zimne starty offline przed pierwszą wizytą`, async ({ playwright, browserName, launchOptions }, testInfo) => {
    test.setTimeout(180_000);
    const resources = resourcesFor();
    const deployment = await deploymentServer(upgrade);
    const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'vilda-sodium-dzm-offline-'));
    const launch = () => playwright[browserName].launchPersistentContext(profile, {
      ...launchOptions, serviceWorkers: 'allow', locale: 'pl-PL', timezoneId: 'Europe/Warsaw',
      reducedMotion: 'reduce', viewport: { width: 320, height: 1000 },
    });
    let context;
    const proof = { baseline: upgrade ? deployment.baseline : 'fresh-current-production-install',
      baselineSha: upgrade ? deployment.baselineSha : null, workerVersion: deployment.version, previousVersion: upgrade ? deployment.previousVersion : null,
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
        const result = await fictionalSodiumAndNotes(offline.page);
        await assertResourceDelivery(offline.page, resources, offline.loaded);
        const [savedNote] = (await memory(offline.page)).notes;
        const lazyStart = await lazyStartAndNotes(offline.page, deployment.origin, savedNote, resources, offline.loaded);
        const clinicalProof = { result, lazyStart };
        if (previous) expect(clinicalProof).toEqual(previous); else previous = clinicalProof;
        expect(offline.failed, 'Brak utraconych zasobów aplikacji').toEqual([]);
        expect(offline.errors).toEqual([]);
        proof.offlinePages.push({ result, lazyStart, failedApplicationRequests: offline.failed, externalRequestFailures: offline.externalFailed, pageErrors: offline.errors });
        await context.close(); context = null;
      }
      expect(resourcesFor(), 'Źródła nie zmieniły się w trakcie próby').toEqual(resources);
      const proofPath = testInfo.outputPath('sodium-notes-production-offline-proof.json');
      fs.writeFileSync(proofPath, JSON.stringify(proof, null, 2));
      await testInfo.attach('sodium-notes-production-offline-proof', { path: proofPath, contentType: 'application/json' });
    } finally {
      if (context) await context.close();
      await deployment.stop();
      deployment.cleanup();
      fs.rmSync(profile, { recursive: true, force: true });
    }
  });
}
