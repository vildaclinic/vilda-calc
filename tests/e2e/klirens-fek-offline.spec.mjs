import { createServer } from 'node:http';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';

test.use({ serviceWorkers: 'allow' });
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const html = fs.readFileSync(path.join(root, 'kalkulator-klirens.html'), 'utf8');
const workerSource = fs.readFileSync(path.join(root, 'service-worker-kalorii.js'), 'utf8');
const workerVersion = /const SW_VERSION = '([^']+)'/.exec(workerSource)[1];
const resourceNames = ['clcr_fek_reference_data.js', 'clcr_fek.js', 'clcr_fek_ui.js', 'clcr_fek_ui.css', 'clcr_fek_persistence.js',
  'clcr_ui_workflow.js', 'clcr_clinical_safety.js', 'clcr_result_presentation.js', 'inline_kalkulator_klirens_02.js',
  'inline_kalkulator_klirens_04.js', 'inline_kalkulator_klirens_07.js'];
const resourceUrls = [...html.matchAll(/(?:src|href)="([^"]+)"/g)].map(match => match[1]);
const resources = resourceNames.map(name => {
  const url = resourceUrls.find(value => value.split('?')[0] === name);
  if (!url) throw new Error(`Klirens nie ładuje ${name}`);
  return { url: '/' + url, sha256: hash(fs.readFileSync(path.join(root, name))) };
});
const sourceHashes = { 'kalkulator-klirens.html': hash(html), 'service-worker-kalorii.js': hash(workerSource),
  ...Object.fromEntries(resources.map((resource, index) => [resourceNames[index], resource.sha256])) };

async function startServer() {
  const types = { '.html': 'text/html', '.js': 'application/javascript', '.mjs': 'application/javascript',
    '.json': 'application/json', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png' };
  let calculatorNavigations = 0;
  const server = createServer((req, res) => {
    const url = new URL(req.url, 'http://127.0.0.1');
    if (url.pathname === '/kalkulator-klirens.html' && req.headers['sec-fetch-dest'] === 'document') calculatorNavigations += 1;
    const target = path.resolve(root, '.' + decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname));
    if (!target.startsWith(root + path.sep)) { res.writeHead(403).end(); return; }
    if (!fs.existsSync(target) || !fs.statSync(target).isFile()) { res.writeHead(404).end(); return; }
    res.writeHead(200, { 'Content-Type': types[path.extname(target)] || 'application/octet-stream',
      'Cache-Control': 'no-cache', 'Service-Worker-Allowed': '/' });
    fs.createReadStream(target).pipe(res);
  });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  let stopped = false;
  return {
    origin: `http://127.0.0.1:${server.address().port}`,
    calculatorNavigations: () => calculatorNavigations,
    isStopped: () => stopped,
    stop: () => new Promise(resolve => {
      if (stopped) { resolve(); return; }
      stopped = true;
      server.close(resolve);
      server.closeAllConnections();
    }),
  };
}

async function precacheHashes(page) {
  return page.evaluate(async ({ version, resources }) => {
    const cache = await caches.open(`pwa-kalorii-shell-v${version}`);
    return Promise.all(resources.map(async ({ url }) => {
      const response = await cache.match(url);
      if (!response || !response.ok) throw new Error(`Brak zasobu w pełnym precache: ${url}`);
      const digest = await crypto.subtle.digest('SHA-256', await response.arrayBuffer());
      return { url, sha256: [...new Uint8Array(digest)].map(x => x.toString(16).padStart(2, '0')).join('') };
    }));
  }, { version: workerVersion, resources });
}

async function installWorker(page, origin) {
  await page.goto(origin + '/tests/fixtures/service-worker-runner.html');
  const state = await page.evaluate(async () => {
    const registration = await navigator.serviceWorker.register('/service-worker-kalorii.js', { scope: '/' });
    const worker = registration.installing || registration.waiting || registration.active;
    const finished = () => ['activated', 'redundant'].includes(worker.state);
    if (!finished()) await new Promise(resolve => {
      worker.addEventListener('statechange', () => { if (finished()) resolve(); });
    });
    return worker.state;
  });
  expect(state, 'Pełny produkcyjny SW aktywowano bez wcześniejszego otwierania Klirensu').toBe('activated');
  expect(await precacheHashes(page), 'Wszystkie moduły FEK i CSS są w precache przed pierwszym uruchomieniem kalkulatora').toEqual(resources);
}

async function offlinePage(context, origin) {
  const page = await context.newPage();
  const loaded = new Map();
  const failed = [];
  const externalFailed = [];
  const errors = [];
  page.on('response', response => {
    const url = new URL(response.url());
    const key = url.pathname + url.search;
    if (resources.some(resource => resource.url === key)) loaded.set(key, response.fromServiceWorker());
  });
  page.on('requestfailed', request => {
    const url = new URL(request.url());
    if (url.origin === origin && !url.pathname.startsWith('/__fek-offline-probe-')) failed.push(request.url());
    else if (url.origin !== origin) externalFailed.push({ url: request.url(), error: request.failure()?.errorText || '' });
  });
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(origin + '/kalkulator-klirens.html', { waitUntil: 'load' });
  await page.waitForFunction(() => Boolean(window.VildaVault && window.ClcrUiWorkflow &&
    window.VildaClcrFek && window.VildaClcrFekReferenceData && window.ClcrFekUi && window.ClcrFekPersistence));
  const guest = page.getByRole('button', { name: 'Korzystaj bez logowania', exact: true });
  if (await guest.isVisible()) await guest.click();
  await page.waitForFunction(() => !document.documentElement.classList.contains('vilda-auth-locked') &&
    document.documentElement.classList.contains('clcr-workflow-ready') &&
    typeof window.applyClcrSessionSnapshot === 'function' && window.clcrIsResetting !== true);
  if (await page.locator('#consent-decline').isVisible()) await page.locator('#consent-decline').click();
  expect(await page.evaluate(() => window.VildaVault.isUnlocked()), 'Wyłącznie fikcyjny przypadek, bez odblokowania sejfu').toBe(false);
  expect(await page.evaluate(() => new URL(navigator.serviceWorker.controller.scriptURL).pathname)).toBe('/service-worker-kalorii.js');
  expect(await page.evaluate(() => fetch(`/__fek-offline-probe-${Date.now()}`).then(() => false, () => true)),
    'Serwer jest wyłączony przed wpisaniem danych klinicznych').toBe(true);
  for (const resource of resources) {
    expect(loaded.get(resource.url), `${resource.url} załadowano przez produkcyjny SW`).toBe(true);
    const digest = await page.evaluate(async url => {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`Brak odpowiedzi offline dla ${url}`);
      const bytes = await crypto.subtle.digest('SHA-256', await response.arrayBuffer());
      return [...new Uint8Array(bytes)].map(x => x.toString(16).padStart(2, '0')).join('');
    }, resource.url);
    expect(digest, `${resource.url}: bajty offline odpowiadają aktualnej implementacji`).toBe(resource.sha256);
  }
  return { page, failed, externalFailed, errors };
}

async function restoreFek(page, fields) {
  expect(await page.evaluate(inputs => window.applyClcrSessionSnapshot({
    version: 2, currentVersion: 'spot', selectedFormula: 'FEK_spot', inputs: {
      currentVersion: 'spot', formulaPicker: 'FEK_spot', age: '8', ageMonths: '', ageDays: '',
      sex: '', weight: '', height: '', Scr: '',
      U_K_spot: '20', S_K_spot: '4', Ucr_spot: '100', Scr_spot: '1',
      Ucr_spot_unit: 'mg/dl', Scr_spot_unit: 'mg/dl', FENa_sample_status: '',
      spotSampleKind: '', spotSameSpecimen: false, ui_spotSameSpecimen_answer: '',
      spotPairedChemistry: false, ui_spotPairedChemistry_answer: '',
      spotDiureticUse: false, ui_spotDiureticUse_answer: '', spotKnownCKD: false, ui_spotKnownCKD_answer: '',
      ...inputs,
    },
  }, { source: 'e2e-fek-offline-fictional', update: true, dispatchEvents: false, preserveAcrossVersions: true }), fields)).toBe(true);
  await page.waitForFunction(() => window.ClcrUiWorkflow.state.activeFormulaId === 'FEK_spot' && window.clcrIsResetting !== true);
}

async function fictionalFek(page) {
  const card = page.locator('#clcrResultReport .clcr-result-card[data-clcr-series="FEK_spot"]');
  // Expected values are fixed synthetic clinical examples, not a second copy
  // of the formula. The actual production form renders and classifies each one.
  const cases = [
    { label: 'child-within-range', fields: {}, raw: 5, display: '5', status: 'within', referenceCount: 1, reference: '4,6–20,4%' },
    { label: 'child-below-boundary', fields: { U_K_spot: '18.3996' }, raw: 4.5999, display: '4,5999', status: 'below', referenceCount: 1, reference: '4,6–20,4%' },
    { label: 'child-above-boundary', fields: { U_K_spot: '81.6004' }, raw: 20.4001, display: '20,4001', status: 'above', referenceCount: 1, reference: '4,6–20,4%' },
    { label: 'infant-within-range', fields: { age: '0', ageMonths: '6' }, raw: 5, display: '5', status: 'within', referenceCount: 1, reference: '3,8–27,4%' },
    { label: 'twelve-month-overlap', fields: { age: '1', ageMonths: '0' }, raw: 5, display: '5', status: 'unassessed', referenceCount: 2, reference: '3,8–27,4%', secondReference: '4,6–20,4%' },
    { label: 'adult-observed-only', fields: { age: '45', U_K_spot: '40' }, raw: 10, display: '10', status: 'unassessed', referenceCount: 1, reference: '4–16%' },
    { label: 'child-low-potassium', fields: { U_K_spot: '28', S_K_spot: '2.8' }, raw: 10, display: '10', status: 'unassessed', referenceCount: 1, caution: /[Hh]ipokaliem|[Oo]bniżon.*potas/ },
    { label: 'unknown-age-small-positive', fields: { age: '', U_K_spot: '0.04', Ucr_spot: '8.84', Ucr_spot_unit: 'mmol/L', Scr_spot: '88.4', Scr_spot_unit: 'umol' }, raw: 0.01, display: '0,01', status: 'unassessed', referenceCount: 0 },
  ];
  const results = [];
  for (const sample of cases) {
    await restoreFek(page, sample.fields);
    await expect(card).toBeVisible();
    await expect(page.locator('#clcrResultReport .clcr-result-card:visible')).toHaveCount(1);
    await expect(card.locator('.clcr-result-unit')).toHaveText('%');
    const assessment = JSON.parse(await card.getAttribute('data-clcr-fek-snapshot'));
    expect(assessment).toMatchObject({ valid: true, unit: '%', status: sample.status });
    expect(assessment.rawValue).toBeCloseTo(sample.raw, 12);
    expect(assessment.references).toHaveLength(sample.referenceCount);
    expect(assessment.display.text).toBe(sample.display);
    await expect(card.locator('.clcr-result-value')).toHaveText(sample.display);
    expect(Number(assessment.display.text.replace(',', '.'))).toBeGreaterThan(0);
    if (sample.reference) await expect(card).toContainText(sample.reference);
    if (sample.secondReference) await expect(card).toContainText(sample.secondReference);
    if (sample.caution) await expect(card).toContainText(sample.caution);
    if (sample.status === 'unassessed') {
      expect(assessment.outOfRange).toBeNull();
      expect(assessment.referenceActive).toBe(false);
      await expect(card).toHaveAttribute('data-clcr-tone', 'neutral');
      await expect(card).not.toContainText('W zakresie dla wieku');
    } else {
      expect(assessment.outOfRange).toBe(sample.status !== 'within');
      expect(assessment.referenceActive).toBe(true);
      await expect(card).toHaveAttribute('data-clcr-tone', sample.status === 'within' ? 'normal' : 'warning');
    }
    const details = page.locator('#clcr-fek-details');
    if (await details.getAttribute('open') === null) await details.locator(':scope > summary').click();
    await expect(details).toContainText('AENP');
    await expect(details.locator('a[href*="litiasis_documento-consenso_aenp.pdf"]')).toHaveCount(1);
    results.push({ label: sample.label, assessment });
  }
  await expect(page.locator('#fekRequiredCount')).toHaveText('4/4');
  await expect(page.locator('#clcrVisitSaveBtn')).toBeDisabled();
  expect(await page.evaluate(() => window.VildaVault.isUnlocked())).toBe(false);
  return results;
}

// No calculator visit warms a runtime cache: a fresh profile installs the full
// unmodified worker, the server stops, then two cold Chromium starts run FEK.
// Guest form values are re-entered; this does not assert guest session durability.
test('FEK: pełny precache przed pierwszą wizytą i dwa zimne starty offline zachowują wynik oraz normę właściwą dla kontekstu', async ({ playwright, browserName, launchOptions }) => {
  test.setTimeout(180_000);
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'vilda-fek-offline-'));
  const server = await startServer();
  const launch = () => playwright[browserName].launchPersistentContext(profile, {
    ...launchOptions, serviceWorkers: 'allow', locale: 'pl-PL', timezoneId: 'Europe/Warsaw',
    reducedMotion: 'reduce', viewport: { width: 1440, height: 1000 },
  });
  let context;
  const proof = { workerVersion, resources, sourceHashes, precacheBeforeFirstCalculatorVisit: true,
    coldBrowserRestarts: 2, calculatorNavigationsBeforeStop: null, offlinePages: [] };
  try {
    context = await launch();
    const runner = context.pages()[0] || await context.newPage();
    await installWorker(runner, server.origin);
    proof.precache = await precacheHashes(runner);
    proof.calculatorNavigationsBeforeStop = server.calculatorNavigations();
    expect(proof.calculatorNavigationsBeforeStop, 'Przed odłączeniem serwera nie otwierano kalkulatora').toBe(0);
    await context.close();
    context = null;
    await server.stop();
    expect(server.isStopped()).toBe(true);
    let expected;
    for (let index = 0; index < 2; index += 1) {
      context = await launch();
      await context.setOffline(true);
      await context.addInitScript(() => {
        localStorage.setItem('vilda-terms-accepted-v1', JSON.stringify({ version: 1, acceptedAtISO: new Date().toISOString() }));
      });
      const offline = await offlinePage(context, server.origin);
      const result = await fictionalFek(offline.page);
      if (expected) expect(result, 'Drugi zimny start odtwarza te same liczby i oceny bez połączenia').toEqual(expected);
      else expected = result;
      expect(offline.failed, 'Brak nieudanych żądań lokalnych zasobów aplikacji').toEqual([]);
      expect(offline.errors, 'Brak błędów JavaScript po zimnym starcie offline').toEqual([]);
      proof.offlinePages.push({ result, failedApplicationRequests: offline.failed,
        externalRequestFailures: offline.externalFailed, pageErrors: offline.errors });
      await context.close();
      context = null;
    }
    for (const [name, expectedHash] of Object.entries(sourceHashes)) {
      expect(hash(fs.readFileSync(path.join(root, name))), `${name}: źródło nie zmieniło się podczas próby offline`).toBe(expectedHash);
    }
    proof.sourceUnchangedDuringTest = true;
    const proofPath = test.info().outputPath('fek-production-offline-proof.json');
    fs.writeFileSync(proofPath, JSON.stringify(proof, null, 2));
    await test.info().attach('fek-production-offline-proof', { path: proofPath, contentType: 'application/json' });
  } finally {
    if (context) await context.close();
    await server.stop();
    fs.rmSync(profile, { recursive: true, force: true });
  }
});
