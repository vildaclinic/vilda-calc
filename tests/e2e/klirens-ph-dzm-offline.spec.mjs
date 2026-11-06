import { createServer } from 'node:http';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';
import { enterGuest, prepareBrowser, installMemoryVault, saveVisible, memory, PATIENT_ID } from '../support/klirens-patient-record.mjs';
import { showClcrResults, clcrPoint } from '../support/badania-klirens.mjs';

import { restore, expectResult, expectBlocked } from '../support/klirens-ph-dzm-browser.mjs';

test.use({ serviceWorkers: 'allow', actionTimeout: 15_000 });
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const versionOf = source => /const SW_VERSION = '([^']+)'/.exec(source)[1];
const UPDATE_BASE_SHA = '83fa1193a8aa29a9f107067286f4a662e3b14f61';
// CI's E2E checkout uses fetch-depth: 0; archive the actual production tree.
const aliasNames = [
  'nutrition_norms.js', 'nutrition_micros.js', 'vilda_diet_recommendations.js', 'vilda_anorexia_risk.js', 'advanced_growth_kowd.js',
  'vilda_food_data.js', 'vilda_growth_reference_data.js', 'vilda_ree_rownania_data.js',
  'vilda_estimated_intake_input_model.js', 'lab_units_data.js', 'userData.js', 'vitalSigns.js',
  'ds_lms.js', 'reinehr_cdgp_data.js', 'vilda_centile_interpolation.js', 'adult_vitals.js', 'bp_module.js',
  'circumference_module.js', 'wfh_module.js', 'respiratory_module.js', 'gh_therapy_segments.js', 'obesity_response_criteria.js',
  'vilda_down_syndrome.js', 'flu_therapy.js', 'bisphos_therapy.js', 'bisphos_therapy_monitor.js', 'lab_unit_converter.js',
];
const names = [
  'clcr_ph_dzm_reference_data.js', 'clcr_ph_dzm.js', 'clcr_ph_dzm_ui.js', 'clcr_ph_dzm_ui.css', 'clcr_ph_dzm_persistence.js',
  'vilda_patients_list.js', 'vilda_patients_list.css', 'vilda_vault.js', 'vilda_reminders.css', 'vilda_care_plans.css',
  'vilda_chrome.css', 'vilda_chrome.js', 'vilda_shell.css', 'vilda_shell.js', 'vilda_summary_layout.js',
  'clcr_ca_cit_reference_data.js', 'clcr_ca_cit.js', 'clcr_ca_cit_ui.js',
  'clcr_ca_cit.css', 'clcr_ca_cit_persistence.js',
  'vilda_save_status_indicator.js', 'vilda_session_bridge.js', 'vilda_data_import_export.js',
  'clcr_notes_view.js', 'clcr_notes_view.css', 'clcr_record_resources.js',
  'clcr_clinical_safety.js', 'clcr_collection_duration.js', 'clcr_ui_workflow.js', 'clcr_ui_workflow.css', 'vilda_auth_ui.js', 'vilda_auth_ui.css', 'vilda_lab_history_tab.js',
  'vilda_lab_history_tab.css', 'vilda_lab_history.js', 'vilda_lab_result_presentation.js', 'vilda_lab_result_chart.js',
  'clcr_saved_calculation.js', 'clcr_saved_results.js', 'clcr_result_details.js',
  'clcr_saved_legacy_calculator.js', 'inline_kalkulator_klirens_02.js',
  'inline_kalkulator_klirens_04.js', 'inline_kalkulator_klirens_07.js',
];

function aliasResourcesFor() {
  const source = fs.readFileSync(path.join(root, 'service-worker-kalorii.js'), 'utf8');
  const urls = [...source.matchAll(/["'](\/[^"'\s]+)["']/g)].map(match => match[1]);
  return aliasNames.flatMap(name => {
    const candidates = [...new Set(urls.filter(url => url.split('?')[0] === '/' + name))];
    const versioned = candidates.filter(url => /\?v=\d+$/.test(url)).sort((a, b) => Number(b.split('?v=')[1]) - Number(a.split('?v=')[1]));
    if (!versioned.length || !candidates.includes('/' + name)) throw new Error(`Brak dwóch aktualnych kluczy aliasu ${name}`);
    const matches = ['/' + name, versioned[0]];
    return matches.map(url => ({ url, sha256: sha256(fs.readFileSync(path.join(root, name))) }));
  });
}

function resourcesFor(tree = root, preceding = false) {
  const html = fs.readFileSync(path.join(tree, 'kalkulator-klirens.html'));
  const sources = [html.toString(), ...['index.html', 'app.html', 'clcr_record_resources.js', 'vilda_auth_ui.js', 'vilda_lab_history_tab.js'].flatMap(name =>
    fs.existsSync(path.join(tree, name)) ? [fs.readFileSync(path.join(tree, name), 'utf8')] : [])];
  const loaded = sources.flatMap(source => [...source.matchAll(/["']([^"'\s]+\.(?:js|css)\?v=\d+)["']/g)].map(match => match[1]));
  return [{ url: '/kalkulator-klirens.html', sha256: sha256(html) }, ...['index.html', 'app.html'].map(name => ({ url: '/' + name, sha256: sha256(fs.readFileSync(path.join(tree, name))) })), ...names.flatMap(name => {
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
function productionBaseline(baselineSha) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'vilda-ph-dzm-production-base-'));
  try {
    execFileSync('git', ['cat-file', '-e', `${baselineSha}^{tree}`], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] });
    const bytes = execFileSync('git', ['archive', '--format=tar', baselineSha], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 128 * 1024 * 1024 });
    execFileSync('tar', ['-x', '-C', directory], { input: bytes });
    return { directory, cleanup: () => fs.rmSync(directory, { recursive: true, force: true }) };
  } catch (error) {
    fs.rmSync(directory, { recursive: true, force: true });
    throw new Error(`Brak rzeczywistej produkcyjnej bazy ${baselineSha}; pobierz jej historię Git.`, { cause: error });
  }
}

// Build an old synthetic note with the untouched archived implementation. The
// transport below only reseeds the test I/O facade; it does not claim to test
// encrypted-vault migration or unlock a real patient's data.
function precedingPhDzmNote(tree) {
  const legacy = {};
  for (const name of ['clcr_clinical_safety.js', 'clcr_extended_egfr.js', 'clcr_calculation_assumptions.js',
    'clcr_result_reference_data.js', 'clcr_result_presentation.js', 'clcr_collection_duration.js',
    'clcr_saved_results.js', 'clcr_saved_legacy_calculator.js', 'clcr_saved_calculation.js']) {
    new Function('window', 'globalThis', fs.readFileSync(path.join(tree, name), 'utf8'))(legacy, legacy);
  }
  const values = { age: '40', pH24: '6.5', Cl24DurationHours: '24', Cl24DurationSource: 'captured' };
  const old = legacy.ClcrSavedLegacyCalculator.recalculate('pH24', values);
  const dp = { ...old, testKey: 'clcr:pH24', label: old.model.label };
  const snapshot = legacy.ClcrSavedCalculation.createSnapshot(dp, { capture: {
    values, ageYears: 40, fields: Object.keys(values).map(id => ({ id, label: id, type: 'text' })),
  }, clinicalDateISO: '2026-11-05' });
  const note = legacy.ClcrSavedResults.buildPatientNotePayload(dp, { patientId: PATIENT_ID, clinicalDateISO: '2026-11-05' });
  note.body += '\n\n' + legacy.ClcrSavedCalculation.serializeSnapshot(snapshot, note);
  return { ...note, id: 'fictional-pre-ph-dzm-audit-note', rev: 1 };
}

async function deploymentServer(upgrade, baselineSha) {
  const currentWorker = fs.readFileSync(path.join(root, 'service-worker-kalorii.js'), 'utf8');
  const version = versionOf(currentWorker);
  const baseline = upgrade ? productionBaseline(baselineSha) : null;
  const previousRoot = baseline?.directory || root;
  const previousWorker = upgrade ? fs.readFileSync(path.join(previousRoot, 'service-worker-kalorii.js'), 'utf8') : currentWorker;
  const previousVersion = versionOf(previousWorker);
  if (upgrade && version === previousVersion) { baseline.cleanup(); throw new Error('Aktualizacja wymaga różnych rzeczywistych wersji SW'); }
  const precedingResources = upgrade ? resourcesFor(previousRoot, true) : [];
  let promoted = !upgrade, calculatorNavigations = 0, stopped = false;
  const workerResponses = [];
  const newTraffic = () => ({ requests: 0, bytes: 0, installerRequests: 0, installerBytes: 0, inventory: [] });
  const traffic = { current: newTraffic(), previous: newTraffic() };
  // Match the deployment/static server charset; otherwise CDP decodes CSS
  // as Latin-1 before exposing response.body(), corrupting non-ASCII bytes.
  const types = { '.html': 'text/html', '.js': 'application/javascript', '.mjs': 'application/javascript',
    '.json': 'application/json', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png' };
  const server = createServer((request, response) => {
    const trafficPhase = promoted ? traffic.current : traffic.previous;
    trafficPhase.requests += 1;
    const destination = request.headers['sec-fetch-dest'] || '';
    const worker = request.headers['service-worker'] || '';
    const referer = request.headers.referer || '';
    const installer = destination === 'empty' && referer === `http://${request.headers.host}/service-worker-kalorii.js`;
    if (installer) trafficPhase.installerRequests += 1;
    trafficPhase.inventory.push({ url: request.url, destination, worker, referer, installer });
    const pathname = decodeURIComponent(new URL(request.url, 'http://127.0.0.1').pathname);
    if (pathname === '/service-worker-kalorii.js') {
      const bytes = promoted ? currentWorker : previousWorker;
      workerResponses.push({ version: versionOf(bytes), sha256: sha256(bytes) });
      response.writeHead(200, { 'Content-Type': 'application/javascript', 'Cache-Control': 'no-store', 'Service-Worker-Allowed': '/' });
      trafficPhase.bytes += Buffer.byteLength(bytes);
      if (installer) trafficPhase.installerBytes += Buffer.byteLength(bytes);
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
      trafficPhase.bytes += Buffer.byteLength(bytes);
      if (installer) trafficPhase.installerBytes += Buffer.byteLength(bytes);
      response.end(bytes);
    });
  });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(Number(process.env.VILDA_PH_DZM_PWA_PORT || 0), '127.0.0.1', resolve); });
  return { origin: `http://127.0.0.1:${server.address().port}`, version, previousVersion,
    baseline: 'archived-unmodified-production-tree', baselineSha: upgrade ? baselineSha : null,
    cleanup: () => baseline?.cleanup(),
    precedingResources, precedingNote: upgrade ? precedingPhDzmNote(previousRoot) : null,
    traffic, currentWorkerHash: sha256(currentWorker), previousWorkerHash: sha256(previousWorker), workerResponses,
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
  const loaded = new Map(), failed = [], externalFailed = [], errors = [], assetHashes = [], responseChecks = [];
  page.on('response', response => {
    const url = new URL(response.url()), key = url.pathname + url.search;
    if (resources.some(resource => resource.url === key)) loaded.set(key, response.fromServiceWorker());
    if (url.origin === origin && !url.pathname.startsWith('/__ph-dzm-offline-probe-')) {
      responseChecks.push((async () => {
        expect(response.ok(), key + ' ma poprawny status offline').toBe(true);
        expect(response.fromServiceWorker(), key + ' jest dostarczony przez rzeczywisty produkcyjny SW').toBe(true);
        if (/\.(?:js|css|html|json)$/.test(url.pathname)) {
          const file = path.resolve(root, '.' + url.pathname);
          if (!file.startsWith(root + path.sep)) throw new Error('Nieprawidłowa ścieżka zasobu ' + key);
          const actual = sha256(await response.body()), expected = sha256(fs.readFileSync(file));
          expect(actual, key + ' ma aktualne bajty produkcyjne').toBe(expected);
          assetHashes.push({ url: key, sha256: actual, fromServiceWorker: true, status: response.status() });
        }
      })().catch(error => { errors.push(String(error)); }));
    }
  });
  page.on('requestfailed', request => {
    const url = new URL(request.url());
    if (url.origin === origin && !url.pathname.startsWith('/__ph-dzm-offline-probe-')) failed.push(request.url());
    else if (url.origin !== origin) externalFailed.push({ url: request.url(), error: request.failure()?.errorText || '' });
  });
  page.on('pageerror', error => errors.push(error.message));
  await prepareBrowser(page);
  await page.goto(origin + '/kalkulator-klirens.html', { waitUntil: 'load' });
  await page.waitForFunction(() => window.VildaVault && window.ClcrUiWorkflow && window.VildaClcrPhDzm && window.ClcrPhDzmUi && window.ClcrPhDzmPersistence);
  await enterGuest(page, { calculator: true });
  expect(await page.evaluate(() => new URL(navigator.serviceWorker.controller.scriptURL).pathname)).toBe('/service-worker-kalorii.js');
  expect(await page.evaluate(() => fetch(`/__ph-dzm-offline-probe-${Date.now()}`).then(() => false, () => true)), 'Fizycznie wyłączony serwer nie odpowiada').toBe(true);
  return { page, failed, externalFailed, errors, loaded, restoredTabs, assetHashes, responseChecks };
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

async function fictionalPhDzmAndNotes(page) {
  const samples = [];
  for (const sample of [
    { label: 'oneFieldAssumed24h', fields: {}, expected: {} },
    { label: 'exactBelowLowerBoundary', fields: { pH24: '4.4999' }, expected: { raw: 4.4999, status: 'low', tone: 'warning' } },
    { label: 'inclusiveLowerBoundary', fields: { pH24: '4,5' }, expected: { raw: 4.5 } },
    { label: 'inclusiveUpperBoundary', fields: { pH24: '8' }, expected: { raw: 8 } },
    { label: 'aboveUpperBoundary', fields: { pH24: '8.2' }, expected: { raw: 8.2, status: 'high', tone: 'warning' } },
    { label: 'literalZeroIsMeasurement', fields: { pH24: '0' }, expected: { raw: 0, status: 'low', tone: 'warning' } },
    { label: 'knownAcidPreservativeWithholdsNorm', fields: { PH24_preservative: 'acid' }, expected: { status: 'unassessed', tone: 'neutral', reference: false } },
    { label: 'known12hNotRescaled', fields: { Cl24DurationHours: '12', Cl24DurationSource: 'captured' }, expected: { status: 'unassessed', tone: 'neutral', reference: false } },
  ]) {
    await restore(page, sample.fields);
    const result = await expectResult(page, sample.expected);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    if (sample.label === 'oneFieldAssumed24h') {
      expect(result.reference).toMatchObject({ lower: 4.5, upper: 8, lowerInclusive: true, upperInclusive: true });
      expect(result.collection).toMatchObject({ hours: 24, assumed: true });
    }
    samples.push({ label: sample.label, result });
  }
  for (const fields of [{ pH24: '-1' }, { pH24: '15' }, { pH24: 'abc' }, { pH24: '0x6' }]) {
    await restore(page, fields); await expectBlocked(page);
  }
  await page.locator('#clearBtn').click(); await page.waitForFunction(() => window.clcrIsResetting !== true);
  await installMemoryVault(page); await restore(page);
  const result = await expectResult(page, { guest: false });
  const [note] = await saveVisible(page, '2026-11-06');
  expect(note.labResult.valueNum).toBe(5.2);
  expect(note.labResult.norm).toBe('4,5–8,0');
  expect((await memory(page)).originalsLocked).toBe(true);
  return { samples, note, savedModel: result };
}

async function lazyStartAndNotes(page, origin, note, savedModel, resources, loaded) {
  loaded.clear();
  await page.goto(origin + '/index.html', { waitUntil: 'load' });
  await enterGuest(page);
  await installMemoryVault(page);
  await page.evaluate(value => window.__clcrRecordFixture.seed([value]), note);
  await page.evaluate(pid => window.VildaAuthUI.showPatientCard(pid, null, null, { activeTab: 'notes' }), note.patientId);
  const compact = page.locator('.vilda-clcr-note[data-clcr-note-state="ready"]');
  await expect(compact).toHaveCount(1);
  await expect(compact.locator('.clcr-note-value')).toHaveText(note.labResult.value);
  await expect(compact.locator('.clcr-note-reference')).toHaveText(note.labResult.norm);
  const frozen = await page.evaluate(value => {
    const engine = window.VildaClcrPhDzm;
    window.VildaClcrPhDzm = new Proxy({}, { get() { return () => { throw Error('Offline Start must read frozen pH DZM'); }; } });
    try {
      return { measurement: window.ClcrSavedResults.projectPatientNotes([value]).measurements[0], snapshot: window.ClcrPhDzmPersistence.savedAssessment(value) };
    } finally { window.VildaClcrPhDzm = engine; }
  }, note);
  expect(frozen.measurement).toMatchObject({ valueNum: 5.2, parameterKey: 'clcr:pH24', outOfRange: false, norm: '4,5–8,0' });
  // The saved reader adds its public presentation fields to the frozen
  // assessment; assert those too instead of confusing it with the raw engine API.
  expect(frozen.snapshot).toEqual({ ...savedModel, norm: '4,5–8,0', displayValue: '5,2', comparator: '' });
  await compact.getByRole('button', { name: 'Szczegóły obliczenia →', exact: true }).click();
  await page.locator('#editMeasurement').click();
  await page.locator('#editField-pH24').fill('8,2');
  await page.locator('#saveEditedMeasurement').click();
  await expect(page.locator('#editDialog')).toBeHidden();
  const edited = (await memory(page)).notes.find(value => value.id === note.id);
  expect(edited.id).toBe(note.id);
  expect(edited.labResult.valueNum).toBe(8.2);
  expect(edited.labResult.norm).toBe(note.labResult.norm);
  const editedSnapshot = await page.evaluate(value => window.ClcrPhDzmPersistence.savedAssessment(value), edited);
  expect(editedSnapshot.reference).toEqual(savedModel.reference);
  expect(editedSnapshot).toMatchObject({ status: 'high', outOfRange: true, rawValue: 8.2 });
  await page.locator('#detailsDialog').getByRole('button', { name: 'Zamknij', exact: true }).click();
  await expect(compact.locator('.clcr-note-value')).toHaveText(edited.labResult.value);
  await expect(compact.locator('.clcr-note-reference')).toHaveText(edited.labResult.norm);
  await compact.getByRole('button', { name: 'Zobacz w Badaniach →', exact: true }).click();
  await showClcrResults(page, 'charts');
  const point = clcrPoint(page, note.id);
  await expect.poll(async () => Number(await point.getAttribute('data-value'))).toBe(8.2);
  const lazyResources = resources.filter(resource => /\/(?:clcr_ph_dzm(?:_reference_data|_persistence)?\.js|clcr_record_resources\.js|clcr_saved_calculation\.js|clcr_saved_results\.js|clcr_result_details\.js|vilda_auth_ui\.js|vilda_lab_history_tab\.js|vilda_lab_result_presentation\.js|vilda_lab_result_chart\.js)\?/.test(resource.url));
  await assertResourceDelivery(page, lazyResources, loaded);
  expect((await memory(page)).originalsLocked).toBe(true);
  return { editedValue: edited.labResult.valueNum, frozenValue: frozen.measurement.valueNum, norm: frozen.measurement.norm, lazyResources };
}

async function assertPrecedingNoteRemainsSeparate(page, note, newNote) {
  if (!note) return null;
  const frozen = await page.evaluate(({ old, current }) => {
    const engine = window.VildaClcrPhDzm;
    window.VildaClcrPhDzm = new Proxy({}, { get() { return () => { throw Error('Old pH DZM must not acquire a new norm from current engine'); }; } });
    try {
      const projection = window.ClcrSavedResults.projectPatientNotes([old, current]);
      return {
        measurements: projection.measurements.map(point => ({ noteId: point.noteId, parameterKey: point.parameterKey, valueNum: point.valueNum, norm: point.norm, outOfRange: point.outOfRange })),
        oldSnapshot: window.ClcrSavedCalculation.readSaved(old),
      };
    } finally { window.VildaClcrPhDzm = engine; }
  }, { old: note, current: newNote });
  expect(frozen.measurements).toHaveLength(2);
  const old = frozen.measurements.find(point => point.noteId === note.id);
  const current = frozen.measurements.find(point => point.noteId === newNote.id);
  expect(old).toMatchObject({ parameterKey: 'clcr:pH24', valueNum: 6.5, norm: '', outOfRange: null });
  expect(current).toMatchObject({ parameterKey: 'clcr:pH24', valueNum: 5.2, outOfRange: false, norm: '4,5–8,0' });
  expect(frozen.oldSnapshot).toMatchObject({ valid: true, formulaId: 'pH24', rawValue: 6.5 });
  expect(frozen.oldSnapshot.snapshot.assessment.phDzmSnapshot).toBeUndefined();
  return frozen;
}

for (const baselineSha of [null, UPDATE_BASE_SHA]) {
  const upgrade = Boolean(baselineSha);
  test(`pH DZM: ${upgrade ? 'pełna aktualizacja ' + baselineSha.slice(0, 8) : 'pełna świeża instalacja'} i dwa zimne starty offline`, async ({ playwright, browserName, launchOptions }, testInfo) => {
    test.setTimeout(180_000);
    const resources = resourcesFor(), startupResources = startupResourcesFor(), aliasResources = aliasResourcesFor();
    const deployment = await deploymentServer(upgrade, baselineSha);
    const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'vilda-ph-dzm-offline-'));
    const launch = () => playwright[browserName].launchPersistentContext(profile, {
      ...launchOptions, serviceWorkers: 'allow', locale: 'pl-PL', timezoneId: 'Europe/Warsaw',
      reducedMotion: 'reduce', viewport: { width: 320, height: 1000 },
    });
    let context;
    const proof = { baseline: upgrade ? deployment.baseline : 'fresh-current-production-install',
      baselineSha: upgrade ? deployment.baselineSha : null, workerVersion: deployment.version,
      previousVersion: upgrade ? deployment.previousVersion : null,
      currentWorkerSha256: deployment.currentWorkerHash, previousWorkerSha256: upgrade ? deployment.previousWorkerHash : null,
      workerResponses: deployment.workerResponses, resources, startupResources, aliasResources, traffic: deployment.traffic,
      precedingSyntheticNote: deployment.precedingNote, precacheBeforeFirstCalculatorVisit: true, coldBrowserRestarts: 2, offlinePages: [] };
    try {
      context = await launch();
      const installer = context.pages()[0] || await context.newPage();
      await installWorker(installer, deployment.origin);
      if (upgrade) await updateWorker(installer, deployment);
      proof.precache = await cacheHashes(installer, deployment.version, resources);
      expect(proof.precache).toEqual(resources);
      proof.startupPrecache = await cacheHashes(installer, deployment.version, startupResources);
      expect(proof.startupPrecache).toEqual(startupResources);
      proof.aliasPrecache = await cacheHashes(installer, deployment.version, aliasResources);
      expect(proof.aliasPrecache).toEqual(aliasResources);
      proof.calculatorNavigationsBeforeStop = deployment.navigations();
      expect(proof.calculatorNavigationsBeforeStop).toBe(0);
      // Count real install fetches separately from the two mandatory bootstrap
      // requests. Full Chromium may additionally ask for one favicon; the CI
      // headless shell does not. No other request is excluded from the budget.
      // Keep every request and raw byte, including that optional image, in proof.
      const bootstrap = [
        { url: '/tests/fixtures/service-worker-runner.html', destination: 'document', worker: '' },
        { url: '/service-worker-kalorii.js', destination: 'serviceworker', worker: 'script' },
      ];
      const byUrl = (left, right) => left.url.localeCompare(right.url);
      for (const [phase, traffic] of Object.entries(deployment.traffic)) {
        const initialPhase = phase === (upgrade ? 'previous' : 'current');
        const expectedBootstrap = initialPhase ? bootstrap : upgrade && phase === 'current' ? bootstrap.slice(1) : [];
        const observedBootstrap = traffic.inventory.filter(request => !request.installer)
          .map(({ url, destination, worker }) => ({ url, destination, worker }));
        const favicon = observedBootstrap.filter(request => request.url === '/favicon.ico');
        expect(favicon.length, `${phase}: najwyżej jedno opcjonalne żądanie favicon`).toBeLessThanOrEqual(initialPhase ? 1 : 0);
        if (favicon.length) expect(favicon[0]).toEqual({ url: '/favicon.ico', destination: 'image', worker: '' });
        expect(observedBootstrap.filter(request => request.url !== '/favicon.ico').sort(byUrl), `${phase}: wyłącznie jawny bootstrap`).toEqual([...expectedBootstrap].sort(byUrl));
        expect(traffic.requests, `${phase}: pełny licznik HTTP`).toBe(traffic.installerRequests + expectedBootstrap.length + favicon.length);
        expect(traffic.installerRequests, `${phase}: budżet instalacji`).toBeLessThanOrEqual(600);
        expect(traffic.installerBytes, `${phase}: bajty instalatora`).toBeLessThan(40 * 1024 * 1024);
        expect(traffic.bytes, `${phase}: budżet instalacji`).toBeLessThan(40 * 1024 * 1024);
      }
      await context.close(); context = null;
      await deployment.stop();
      let preceding;
      for (let index = 0; index < 2; index += 1) {
        context = await launch();
        await context.setOffline(true);
        await context.addInitScript(() => localStorage.setItem('vilda-terms-accepted-v1', JSON.stringify({ version: 1, acceptedAtISO: new Date().toISOString() })));
        const offline = await offlinePage(context, deployment.origin, [...resources, ...startupResources, ...aliasResources]);
        const result = await fictionalPhDzmAndNotes(offline.page);
        await offline.page.screenshot({ path: testInfo.outputPath(`offline-calculator-${index + 1}.png`), fullPage: true });
        await assertResourceDelivery(offline.page, resources, offline.loaded, { alreadyLoaded: false });
        await assertResourceDelivery(offline.page, aliasResources, offline.loaded, { alreadyLoaded: false });
        const lazy = await lazyStartAndNotes(offline.page, deployment.origin, result.note, result.savedModel, resources, offline.loaded);
        await offline.page.screenshot({ path: testInfo.outputPath(`offline-patient-results-${index + 1}.png`), fullPage: true });
        await assertResourceDelivery(offline.page, startupResources, offline.loaded);
        const legacy = await assertPrecedingNoteRemainsSeparate(offline.page, deployment.precedingNote, result.note);
        // Each cold-start scenario makes a fresh synthetic save with a new UUID.
        // Verify identities above, retain them in proof, compare clinical data here.
        const comparableLegacy = legacy ? { ...legacy, measurements: legacy.measurements.map(({ noteId, ...point }) => point) } : null;
        const clinical = { samples: result.samples, lazy, legacy: comparableLegacy };
        if (preceding) expect(clinical).toEqual(preceding); else preceding = clinical;
        await Promise.all(offline.responseChecks);
        expect(offline.assetHashes.length).toBeGreaterThan(50);
        expect(offline.failed).toEqual([]);
        expect(offline.errors).toEqual([]);
        proof.offlinePages.push({ result, lazy, legacy, restoredTabs: offline.restoredTabs, pageErrors: offline.errors,
          failedApplicationRequests: offline.failed, externalRequestFailures: offline.externalFailed, deliveredApplicationAssetHashes: offline.assetHashes });
        await context.close(); context = null;
      }
      expect(resourcesFor(), 'Źródła nie zmieniły się podczas próby').toEqual(resources);
      expect(sha256(fs.readFileSync(path.join(root, 'service-worker-kalorii.js'))), 'Produkcyjny SW nie zmienił się podczas próby').toBe(deployment.currentWorkerHash);
    } finally {
      // Keep the complete actual request inventory also if a budget or clinical
      // assertion fails, so the cause can be checked without inferring traffic.
      const proofPath = testInfo.outputPath('ph-dzm-production-offline-proof.json');
      fs.writeFileSync(proofPath, JSON.stringify(proof, null, 2));
      await testInfo.attach('ph-dzm-production-offline-proof', { path: proofPath, contentType: 'application/json' });
      if (context) await context.close();
      await deployment.stop(); deployment.cleanup();
      fs.rmSync(profile, { recursive: true, force: true });
    }
  });
}
