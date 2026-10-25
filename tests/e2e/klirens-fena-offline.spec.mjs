import { createServer } from 'node:http';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';

test.use({ serviceWorkers: 'allow' });
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const html = fs.readFileSync(path.join(root, 'kalkulator-klirens.html'), 'utf8');
const workerSource = fs.readFileSync(path.join(root, 'service-worker-kalorii.js'), 'utf8');
const workerVersion = /const SW_VERSION = '([^']+)'/.exec(workerSource)[1];
const resourceNames = ['clcr_fena_reference_data.js', 'clcr_fena.js', 'clcr_fena_ui.js', 'clcr_fena_ui.css', 'clcr_fena_persistence.js',
  'clcr_ui_workflow.js', 'clcr_clinical_safety.js', 'clcr_result_presentation.js', 'inline_kalkulator_klirens_04.js', 'inline_kalkulator_klirens_07.js'];
const resourceUrls = [...html.matchAll(/(?:src|href)="([^"]+)"/g)].map(match => match[1]);
const resources = resourceNames.map(name => {
  const url = resourceUrls.find(value => value.split('?')[0] === name);
  if (!url) throw new Error(`Klirens nie ładuje ${name}`);
  return { url: '/' + url, sha256: createHash('sha256').update(fs.readFileSync(path.join(root, name))).digest('hex') };
});

async function startServer() {
  const types = { '.html': 'text/html', '.js': 'application/javascript', '.mjs': 'application/javascript',
    '.json': 'application/json', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png' };
  const server = createServer((req, res) => {
    const url = new URL(req.url, 'http://127.0.0.1');
    const target = path.resolve(root, '.' + decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname));
    if (!target.startsWith(root + path.sep)) { res.writeHead(403).end(); return; }
    if (!fs.existsSync(target) || !fs.statSync(target).isFile()) { res.writeHead(404).end(); return; }
    res.writeHead(200, { 'Content-Type': types[path.extname(target)] || 'application/octet-stream',
      'Cache-Control': 'no-cache', 'Service-Worker-Allowed': '/' });
    fs.createReadStream(target).pipe(res);
  });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  let stopped = false;
  return { origin: `http://127.0.0.1:${server.address().port}`, stop: () => new Promise(resolve => {
    if (stopped) { resolve(); return; }
    stopped = true;
    server.close(resolve);
    server.closeAllConnections();
  }) };
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
  expect(state, 'Pełny produkcyjny SW instalowany i aktywowany bez wcześniejszego otwierania Klirensu').toBe('activated');
  expect(await precacheHashes(page), 'Nowe moduły i CSS muszą być w precache przed pierwszym uruchomieniem kalkulatora').toEqual(resources);
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
    if (url.origin === origin && !url.pathname.startsWith('/__fena-offline-probe-')) failed.push(request.url());
    else if (url.origin !== origin) externalFailed.push({ url: request.url(), error: request.failure()?.errorText || '' });
  });
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(origin + '/kalkulator-klirens.html', { waitUntil: 'load' });
  await page.waitForFunction(() => Boolean(window.VildaVault && window.ClcrUiWorkflow &&
    window.VildaClcrFena && window.VildaClcrFenaReferenceData && window.ClcrFenaUi));
  const guest = page.getByRole('button', { name: 'Korzystaj bez logowania', exact: true });
  if (await guest.isVisible()) await guest.click();
  await page.waitForFunction(() => !document.documentElement.classList.contains('vilda-auth-locked') &&
    document.documentElement.classList.contains('clcr-workflow-ready') &&
    typeof window.applyClcrSessionSnapshot === 'function' && window.clcrIsResetting !== true);
  if (await page.locator('#consent-decline').isVisible()) await page.locator('#consent-decline').click();
  expect(await page.evaluate(() => window.VildaVault.isUnlocked()), 'Fikcyjny przypadek działa bez odblokowania sejfu').toBe(false);
  expect(await page.evaluate(() => new URL(navigator.serviceWorker.controller.scriptURL).pathname)).toBe('/service-worker-kalorii.js');
  expect(await page.evaluate(() => fetch(`/__fena-offline-probe-${Date.now()}`).then(() => false, () => true)),
    'Serwer jest wyłączony przed wpisaniem danych klinicznych').toBe(true);
  for (const resource of resources) {
    expect(loaded.get(resource.url), `${resource.url} załadowano przez produkcyjny SW`).toBe(true);
    const digest = await page.evaluate(async url => {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`Brak odpowiedzi offline dla ${url}`);
      const hash = await crypto.subtle.digest('SHA-256', await response.arrayBuffer());
      return [...new Uint8Array(hash)].map(x => x.toString(16).padStart(2, '0')).join('');
    }, resource.url);
    expect(digest, `${resource.url}: bajty offline odpowiadają bieżącemu źródłu`).toBe(resource.sha256);
  }
  return { page, failed, externalFailed, errors };
}

async function restoreFena(page, fields) {
  expect(await page.evaluate(inputs => window.applyClcrSessionSnapshot({
    version: 2, currentVersion: 'spot', selectedFormula: 'FENa_spot', inputs: {
      currentVersion: 'spot', formulaPicker: 'FENa_spot', age: '45', ageMonths: '', ageDays: '',
      sex: '', weight: '', height: '', Scr: '',
      U_Na_spot: '', S_Na_spot: '', Ucr_spot: '', Scr_spot: '',
      Ucr_spot_unit: 'mg/dl', Scr_spot_unit: 'mg/dl', FENa_sample_status: '',
      spotSampleKind: '', spotSameSpecimen: false, ui_spotSameSpecimen_answer: '',
      spotPairedChemistry: false, ui_spotPairedChemistry_answer: '',
      spotDiureticUse: false, spotKnownCKD: false,
      ...inputs,
    },
  }, { source: 'e2e-fena-offline-fictional', update: true, dispatchEvents: false, preserveAcrossVersions: true }), fields)).toBe(true);
  await page.waitForFunction(() => window.ClcrUiWorkflow.state.activeFormulaId === 'FENa_spot' && window.clcrIsResetting !== true);
}

async function fictionalFena(page) {
  const card = page.locator('#clcrResultReport .clcr-result-card[data-clcr-series="FENa_spot"]');
  const cases = [
    { label: 'adult-below-one', fields: { U_Na_spot: '138.6', S_Na_spot: '140', Ucr_spot: '100', Scr_spot: '1' }, raw: 0.99, display: '0,99', context: 'adult', band: 'low' },
    { label: 'adult-exact-two', fields: { U_Na_spot: '140', S_Na_spot: '140', Ucr_spot: '100', Scr_spot: '2' }, raw: 2, display: '2', context: 'adult', band: 'middle' },
    { label: 'child-small-positive', fields: { age: '8', U_Na_spot: '1.4', S_Na_spot: '140', Ucr_spot: '100', Scr_spot: '1' }, raw: 0.01, display: '0,01', context: 'child', band: null },
    { label: 'unknown-age', fields: { age: '', U_Na_spot: '20', S_Na_spot: '140', Ucr_spot: '8.84', Ucr_spot_unit: 'mmol/L', Scr_spot: '88.4', Scr_spot_unit: 'umol' }, raw: 1 / 7, display: '0,1429', context: 'unknown', band: null },
  ];
  const results = [];
  for (const sample of cases) {
    await restoreFena(page, sample.fields);
    await expect(card).toBeVisible();
    await expect(page.locator('#clcrResultReport .clcr-result-card:visible')).toHaveCount(1);
    await expect(card).toHaveAttribute('data-clcr-tone', 'neutral');
    await expect(card.locator('.clcr-result-unit')).toHaveText('%');
    const value = JSON.parse(await card.getAttribute('data-clcr-fena-snapshot'));
    expect(value).toMatchObject({ valid: true, unit: '%', status: 'unassessed', tone: 'neutral', context: sample.context, helperBand: sample.band });
    expect(value.rawValue).toBeCloseTo(sample.raw, 12);
    expect(value.display.text).toBe(sample.display);
    await expect(card.locator('.clcr-result-value')).toHaveText(sample.display);
    expect(Number(value.display.text.replace(',', '.'))).toBeGreaterThan(0);
    expect(value.category).toBeNull();
    const details = page.locator('#clcr-fena-details');
    if (await details.getAttribute('open') === null) await details.locator(':scope > summary').click();
    await expect(details).toContainText('KDIGO');
    await expect(details.locator('a[href*="KDIGO-AKI-Suppl-Appendices"]')).toHaveCount(1);
    await expect(details.locator('a[href*="KDIGO-AKI-Suppl-Appendices"]')).toBeVisible();
    if (sample.band) {
      await expect(details.locator(`[data-fena-band="${sample.band}"]`)).toHaveAttribute('aria-current', 'true');
    } else {
      await expect(details.locator('[data-fena-band][aria-current="true"]')).toHaveCount(0);
      await expect(card).toContainText(/Brak uniwersalnej normy/);
    }
    results.push({ label: sample.label, assessment: value });
  }
  await expect(page.locator('#fenaRequiredCount')).toHaveText('4/4');
  await expect(page.locator('#clcrVisitSaveBtn')).toBeDisabled();
  expect(await page.evaluate(() => window.VildaVault.isUnlocked())).toBe(false);
  return results;
}

// A genuinely fresh persistent profile installs the complete production worker.
// The origin is then stopped and Chromium restarted before first visiting the
// calculator. Synthetic values are entered again on a second cold-offline page;
// no claim is made about guest form persistence across browser restarts.
test('FENa: pełny precache przed pierwszą wizytą i dwa zimne starty offline zachowują dokładność oraz kontekst oceny', async ({ playwright, browserName, launchOptions }) => {
  test.setTimeout(180_000);
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'vilda-fena-offline-'));
  const server = await startServer();
  const launch = () => playwright[browserName].launchPersistentContext(profile, {
    ...launchOptions, serviceWorkers: 'allow', locale: 'pl-PL', timezoneId: 'Europe/Warsaw',
    reducedMotion: 'reduce', viewport: { width: 1440, height: 1000 },
  });
  let context;
  const proof = { workerVersion, resources, precacheBeforeFirstCalculatorVisit: true, coldBrowserRestarts: 2, offlinePages: [] };
  try {
    context = await launch();
    await installWorker(context.pages()[0] || await context.newPage(), server.origin);
    proof.precache = await precacheHashes(context.pages()[0]);
    await context.close();
    context = null;
    await server.stop();
    context = await launch();
    await context.setOffline(true);
    await context.addInitScript(() => {
      localStorage.setItem('vilda-terms-accepted-v1', JSON.stringify({ version: 1, acceptedAtISO: new Date().toISOString() }));
    });
    let expected;
    for (let index = 0; index < 2; index += 1) {
      if (index > 0) {
        await context.close();
        context = await launch();
        await context.setOffline(true);
      }
      const offline = await offlinePage(context, server.origin);
      const result = await fictionalFena(offline.page);
      if (expected) expect(result, 'Nowa strona offline odtwarza te same liczby i kontekst bez ponownego połączenia').toEqual(expected);
      else expected = result;
      expect(offline.failed, 'Brak nieudanych żądań lokalnych zasobów aplikacji').toEqual([]);
      expect(offline.errors, 'Brak błędów JavaScript po zimnym starcie offline').toEqual([]);
      proof.offlinePages.push({ result, failedApplicationRequests: offline.failed,
        externalRequestFailures: offline.externalFailed, pageErrors: offline.errors });
      await offline.page.close();
    }
    const proofPath = test.info().outputPath('fena-production-offline-proof.json');
    fs.writeFileSync(proofPath, JSON.stringify(proof, null, 2));
    await test.info().attach('fena-production-offline-proof', { path: proofPath, contentType: 'application/json' });
  } finally {
    if (context) await context.close();
    await server.stop();
    fs.rmSync(profile, { recursive: true, force: true });
  }
});
