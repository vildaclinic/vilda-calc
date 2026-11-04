import { showClcrResults, clcrPoint } from '../support/badania-klirens.mjs';
import { createServer } from 'node:http';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';
import { expectResult, restore } from './urate-creatinine.helpers.mjs';
import { enterGuest, prepareBrowser, installMemoryVault, saveVisible, memory } from '../support/klirens-patient-record.mjs';

test.use({ serviceWorkers: 'allow', actionTimeout: 15_000 });
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const versionOf = source => /const SW_VERSION = '([^']+)'/.exec(source)[1];
const UPDATE_BASE_SHA = '6298d776630dead4a45f2d6b4b3c54d5285cd309';
const names = [
  'clcr_urate_creatinine_data.js', 'clcr_urate_creatinine.js', 'clcr_urate_creatinine_ui.js',
  'clcr_urate_creatinine.css', 'clcr_urate_creatinine_persistence.js',
  'vilda_save_status_indicator.js', 'vilda_session_bridge.js',
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

// These two unchanged Start dependencies exposed a harness race when Chromium
// restored its previous Start tab and the test navigated that loading tab away.
// Keep their full-cache availability and actual SW delivery independently visible.
function startupResourcesFor() {
  const index = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const report = /["'](vilda_patient_report\.js\?v=\d+)["']/.exec(index)?.[1];
  if (!report) throw new Error('Brak produkcyjnego adresu raportu pacjenta Start');
  return [
    { url: '/micronorms_norms.json', sha256: sha256(fs.readFileSync(path.join(root, 'micronorms_norms.json'))) },
    { url: '/' + report, sha256: sha256(fs.readFileSync(path.join(root, 'vilda_patient_report.js'))) },
  ];
}

// The update must use an actual production tree. A fabricated preceding SW
// header over current bytes cannot detect a missing newly introduced module.
function productionBaseline() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'vilda-urate-creatinine-production-base-'));
  try {
    execFileSync('git', ['cat-file', '-e', `${UPDATE_BASE_SHA}^{tree}`], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] });
    const bytes = execFileSync('git', ['archive', '--format=tar', UPDATE_BASE_SHA], { cwd: root, maxBuffer: 128 * 1024 * 1024 });
    execFileSync('tar', ['-x', '-C', directory], { input: bytes });
    return { directory, cleanup: () => fs.rmSync(directory, { recursive: true, force: true }) };
  } catch (error) {
    fs.rmSync(directory, { recursive: true, force: true });
    throw new Error(`Brak rzeczywistej produkcyjnej bazy ${UPDATE_BASE_SHA}; pobierz jej historię Git.`, { cause: error });
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
  // A persistent browser can automatically restore the previous Start tab.
  // Own a new blank target instead of cancelling that restored document with
  // goto(). Close restored tabs before collecting target request failures; no
  // error codes or application URLs are filtered from the target assertions.
  const restored = context.pages();
  const restoredTabs = restored.map(page => page.url());
  const page = await context.newPage();
  await Promise.all(restored.map(previous => previous.close()));
  const loaded = new Map(), failed = [], externalFailed = [], errors = [];
  page.on('response', response => {
    const url = new URL(response.url()), key = url.pathname + url.search;
    if (resources.some(resource => resource.url === key)) loaded.set(key, response.fromServiceWorker());
  });
  page.on('requestfailed', request => {
    const url = new URL(request.url());
    if (url.origin === origin && !url.pathname.startsWith('/__urate-creatinine-offline-probe-')) failed.push(request.url());
    else if (url.origin !== origin) externalFailed.push({ url: request.url(), error: request.failure()?.errorText || '' });
  });
  page.on('pageerror', error => errors.push(error.message));
  await prepareBrowser(page);
  await page.goto(origin + '/kalkulator-klirens.html', { waitUntil: 'load' });
  await page.waitForFunction(() => window.VildaVault && window.ClcrUiWorkflow && window.VildaClcrUrateCreatinine && window.ClcrUrateCreatinineUi);
  await enterGuest(page, { calculator: true });
  expect(await page.evaluate(() => new URL(navigator.serviceWorker.controller.scriptURL).pathname)).toBe('/service-worker-kalorii.js');
  expect(await page.evaluate(() => fetch(`/__urate-creatinine-offline-probe-${Date.now()}`).then(() => false, () => true)), 'Fizycznie wyłączony serwer nie odpowiada').toBe(true);
  return { page, failed, externalFailed, errors, loaded, restoredTabs };
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

async function fictionalUrateCreatinineAndNotes(page) {
  const samples = [];
  for (const sample of [
    { label: 'adult-high-random', fields: {}, expected: {} },
    { label: 'child-age-range', fields: { age: '8' }, expected: { status: 'within', tone: 'normal' } },
    { label: 'timed-no-random-reference', fields: { URCR_specimen: 'timed' }, expected: { status: 'unassessed', tone: 'neutral', reference: false } },
    { label: 'tiny-positive', fields: { URCR_inputMode: 'reported', URCR_reportedValue: '0.0004' }, expected: { raw: 0.0004, status: 'low', tone: 'warning' } },
    { label: 'zero-neutral', fields: { URCR_uricAcid: '0' }, expected: { raw: 0, status: 'zero', tone: 'neutral', reference: false, available: true } },
  ]) {
    await restore(page, sample.fields);
    const result = await expectResult(page, sample.expected);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    samples.push({ label: sample.label, result });
  }
  // Select a saved fictional patient before entering a fresh measurement.
  await page.locator('#clearBtn').click(); await page.waitForFunction(() => window.clcrIsResetting !== true);
  await installMemoryVault(page); await restore(page); const model = await expectResult(page, { guest: false });
  const [note] = await saveVisible(page, '2026-11-02');
  expect((await memory(page)).notes).toHaveLength(1);
  expect(note.labResult.valueNum).toBeCloseTo(0.6728927487954316, 14);
  expect(note.labResult.value).toBe(model.presentation.valueText);
  await page.locator('#clcrOpenBadaniaBtn').click();
  await showClcrResults(page, 'charts'); await expect(page.locator('.vilda-auth-patient-card')).toBeVisible();
  await page.locator('button[data-tab="notes"]').click();
  const compact = page.locator('.vilda-clcr-note[data-clcr-note-state="ready"]'); await expect(compact).toHaveCount(1);
  await expect(compact.locator('.clcr-note-value')).toHaveText(model.presentation.valueText);
  await expect(compact.locator('.clcr-note-reference')).toHaveText('0,11–0,53');
  for (const key of ['VILDA_CLCR', 'engineVersion', 'exactMain', '[tekst]', 'Sam wynik nie rozpoznaje kamicy ani nie zastępuje oceny dobowego wydalania.']) await expect(compact).not.toContainText(key);
  expect(await compact.evaluate(node => node.scrollWidth <= node.clientWidth + 1)).toBe(true);
  await compact.getByRole('button', { name: 'Szczegóły obliczenia →', exact: true }).click();
  await expect(page.locator('#calculationDetails')).toHaveAttribute('data-note-id', note.id);
  await page.locator('#editMeasurement').click(); await page.locator('#editField-URCR_uricAcid').fill('60');
  await page.locator('#saveEditedMeasurement').click(); await expect(page.locator('#editDialog')).toBeHidden();
  const edited = (await memory(page)).notes.find(item => item.id === note.id);
  expect(edited.labResult.valueNum).toBeCloseTo(Number('0.40373564927725894'), 14); expect(edited.id).toBe(note.id);
  await page.locator('#detailsDialog').getByRole('button', { name: 'Zamknij', exact: true }).click();
  await expect(compact.locator('.clcr-note-value')).toHaveText(edited.labResult.value);
  const reread = await page.evaluate(value => window.ClcrSavedResults.projectPatientNotes([value]).measurements[0], edited);
  expect(reread.valueNum).toBeCloseTo(Number('0.40373564927725894'), 14); expect(reread.norm).toBe('0,11–0,53 mmol/mmol'); expect((await memory(page)).originalsLocked).toBe(true);
  return { samples, note: { value: note.labResult.value, unit: note.labResult.unit, category: note.category, editedValue: edited.labResult.valueNum, rereadValue: reread.valueNum } };
}

async function lazyStartAndNotes(page, origin, note, resources, loaded) {
  // New Start document: persistence/Details must be available from the same
  // production SW without any preceding online visit to the new calculator.
  loaded.clear();
  await page.goto(origin + '/index.html', { waitUntil: 'load' });
  await enterGuest(page); await installMemoryVault(page);
  await page.evaluate(value => window.__clcrRecordFixture.seed([value]), note);
  await page.evaluate(pid => window.VildaAuthUI.showPatientCard(pid, null, null, { activeTab: 'notes' }), note.patientId);
  const compact = page.locator('.vilda-clcr-note[data-clcr-note-state="ready"]');
  await expect(compact).toHaveCount(1); await expect(compact.locator('.clcr-note-value')).toHaveText(note.labResult.value);
  await page.waitForFunction(() => Boolean(window.VildaClcrUrateCreatinine && window.ClcrUrateCreatininePersistence));
  await compact.getByRole('button', { name: 'Szczegóły obliczenia →', exact: true }).click();
  await page.locator('#editMeasurement').click(); await page.locator('#editField-URCR_uricAcid').fill('30');
  await page.locator('#saveEditedMeasurement').click(); await expect(page.locator('#editDialog')).toBeHidden();
  const edited = (await memory(page)).notes.find(value => value.id === note.id);
  expect(edited.id).toBe(note.id); expect(edited.labResult.valueNum).toBeCloseTo(Number('0.20186782463862947'), 14);
  await page.locator('#detailsDialog').getByRole('button', { name: 'Zamknij', exact: true }).click();
  await expect(compact.locator('.clcr-note-value')).toHaveText(edited.labResult.value);
  const saved = await page.evaluate(value => {
    const engine = window.VildaClcrUrateCreatinine;
    window.VildaClcrUrateCreatinine = new Proxy({}, { get() { return () => { throw new Error('Offline Start history must remain frozen'); }; } });
    try { return window.ClcrSavedResults.projectPatientNotes([value]).measurements[0]; }
    finally { window.VildaClcrUrateCreatinine = engine; }
  }, edited);
  expect(saved.valueNum).toBeCloseTo(Number('0.20186782463862947'), 14); expect(saved).toMatchObject({ outOfRange: false, norm: '0,11–0,53 mmol/mmol' });
  await compact.getByRole('button', { name: 'Zobacz w Badaniach →', exact: true }).click();
  await showClcrResults(page, 'charts');
  const point = clcrPoint(page, note.id);
  await expect.poll(async () => Number(await point.getAttribute('data-value'))).toBeCloseTo(Number('0.20186782463862947'), 14);
  const lazyResources = resources.filter(resource => /\/(?:clcr_urate_creatinine(?:_data|_persistence)?\.js|clcr_record_resources\.js|clcr_saved_calculation\.js|clcr_saved_results\.js|clcr_result_details\.js|vilda_auth_ui\.js|vilda_lab_history_tab\.js)\?/.test(resource.url));
  expect(lazyResources.filter(resource => resource.url.includes('/clcr_urate_creatinine'))).toHaveLength(3);
  await assertResourceDelivery(page, lazyResources, loaded);
  const calculatorResources = resources.filter(resource => /\/clcr_urate_creatinine(?:_ui\.js|\.css)\?/.test(resource.url));
  expect(calculatorResources).toHaveLength(2);
  await assertResourceDelivery(page, calculatorResources, loaded, { alreadyLoaded: false });
  expect((await memory(page)).originalsLocked).toBe(true);
  return { editedValue: edited.labResult.valueNum, frozenValue: saved.valueNum, norm: saved.norm, resources: [...lazyResources, ...calculatorResources] };
}

for (const upgrade of [false, true]) {
  test(`KM/Cr/Notes: ${upgrade ? 'aktualizacja produkcyjnego SW' : 'pełna świeża instalacja'} i dwa zimne starty offline przed pierwszą wizytą`, async ({ playwright, browserName, launchOptions }, testInfo) => {
    test.setTimeout(180_000);
    const resources = resourcesFor();
    const startupResources = startupResourcesFor();
    const deployment = await deploymentServer(upgrade);
    const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'vilda-urate-creatinine-offline-'));
    const launch = () => playwright[browserName].launchPersistentContext(profile, {
      ...launchOptions, serviceWorkers: 'allow', locale: 'pl-PL', timezoneId: 'Europe/Warsaw',
      reducedMotion: 'reduce', viewport: { width: 320, height: 1000 },
    });
    let context;
    const proof = { baseline: upgrade ? deployment.baseline : 'fresh-current-production-install',
      baselineSha: upgrade ? deployment.baselineSha : null, workerVersion: deployment.version, previousVersion: upgrade ? deployment.previousVersion : null,
      currentWorkerSha256: deployment.currentWorkerHash,
      previousWorkerSha256: upgrade ? deployment.previousWorkerHash : null,
      workerResponses: deployment.workerResponses,
      resources, startupResources, precacheBeforeFirstCalculatorVisit: true, coldBrowserRestarts: 2, offlinePages: [] };
    try {
      context = await launch();
      const installer = context.pages()[0] || await context.newPage();
      await installWorker(installer, deployment.origin);
      if (upgrade) await updateWorker(installer, deployment);
      proof.precache = await cacheHashes(installer, deployment.version, resources);
      expect(proof.precache).toEqual(resources);
      proof.startupPrecache = await cacheHashes(installer, deployment.version, startupResources);
      expect(proof.startupPrecache).toEqual(startupResources);
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
        const offline = await offlinePage(context, deployment.origin, [...resources, ...startupResources]);
        const result = await fictionalUrateCreatinineAndNotes(offline.page);
        await assertResourceDelivery(offline.page, resources, offline.loaded);
        const [savedNote] = (await memory(offline.page)).notes;
        const lazyStart = await lazyStartAndNotes(offline.page, deployment.origin, savedNote, resources, offline.loaded);
        await assertResourceDelivery(offline.page, startupResources, offline.loaded);
        const clinicalProof = { result, lazyStart };
        if (previous) expect(clinicalProof).toEqual(previous); else previous = clinicalProof;
        expect(offline.failed, 'Brak utraconych zasobów aplikacji').toEqual([]);
        expect(offline.errors).toEqual([]);
        proof.offlinePages.push({ result, lazyStart, restoredTabsClosedBeforeTarget: offline.restoredTabs, startupResourcesVerified: startupResources, failedApplicationRequests: offline.failed, externalRequestFailures: offline.externalFailed, pageErrors: offline.errors });
        await context.close(); context = null;
      }
      expect(resourcesFor(), 'Źródła nie zmieniły się w trakcie próby').toEqual(resources);
      expect(startupResourcesFor(), 'Zasoby Start nie zmieniły się w trakcie próby').toEqual(startupResources);
      const proofPath = testInfo.outputPath('urate-creatinine-notes-production-offline-proof.json');
      fs.writeFileSync(proofPath, JSON.stringify(proof, null, 2));
      await testInfo.attach('urate-creatinine-notes-production-offline-proof', { path: proofPath, contentType: 'application/json' });
    } finally {
      if (context) await context.close();
      await deployment.stop();
      deployment.cleanup();
      fs.rmSync(profile, { recursive: true, force: true });
    }
  });
}
