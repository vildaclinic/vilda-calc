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
const resourceNames = ['clcr_cacr_reference_data.js', 'clcr_cacr.js', 'clcr_cacr_ui.js', 'clcr_cacr_ui.css'];
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
    if (url.origin === origin && !url.pathname.startsWith('/__cacr-offline-probe-')) failed.push(request.url());
    else if (url.origin !== origin) externalFailed.push({ url: request.url(), error: request.failure()?.errorText || '' });
  });
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(origin + '/kalkulator-klirens.html', { waitUntil: 'load' });
  await page.waitForFunction(() => Boolean(window.VildaVault && window.ClcrUiWorkflow &&
    window.VildaClcrCacr && window.VildaClcrCacrReferenceData && window.ClcrCacrUi));
  const guest = page.getByRole('button', { name: 'Korzystaj bez logowania', exact: true });
  if (await guest.isVisible()) await guest.click();
  await page.waitForFunction(() => !document.documentElement.classList.contains('vilda-auth-locked') &&
    document.documentElement.classList.contains('clcr-workflow-ready') &&
    typeof window.applyClcrSessionSnapshot === 'function' && window.clcrIsResetting !== true);
  if (await page.locator('#consent-decline').isVisible()) await page.locator('#consent-decline').click();
  expect(await page.evaluate(() => window.VildaVault.isUnlocked()), 'Fikcyjny przypadek działa bez odblokowania sejfu').toBe(false);
  expect(await page.evaluate(() => new URL(navigator.serviceWorker.controller.scriptURL).pathname)).toBe('/service-worker-kalorii.js');
  expect(await page.evaluate(() => fetch(`/__cacr-offline-probe-${Date.now()}`).then(() => false, () => true)),
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

async function fictionalCacr(page) {
  expect(await page.evaluate(() => window.applyClcrSessionSnapshot({
    version: 2, currentVersion: 'spot', selectedFormula: 'CaCr_spot', inputs: {
      currentVersion: 'spot', formulaPicker: 'CaCr_spot', age: '5', ageMonths: '', ageDays: '',
      sex: '', weight: '', height: '', Scr: '', Ca_spot: '', Ca_spot_unit: 'mg/dl',
      Ucr_spot: '', Ucr_spot_unit: 'mg/dl', CaCr_entry_mode: 'concentration',
      CaCr_reported: '', CaCr_reported_unit: 'mg/mg', CaCr_same_specimen: '',
      spotSampleKind: '', spotSameSpecimen: false, ui_spotSameSpecimen_answer: '',
      spotMenstruation: false, spotHematuria: false, spotInfection: false,
      spotExercise: false, spotAcuteIllness: false,
    },
  }, { source: 'e2e-cacr-offline-fictional', update: true, dispatchEvents: false, preserveAcrossVersions: true }))).toBe(true);
  await page.waitForFunction(() => window.ClcrUiWorkflow.state.activeFormulaId === 'CaCr_spot' && window.clcrIsResetting !== true);
  await expect(page.getByRole('button', { name: 'Oblicz ze stężeń', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await page.locator('#Ca_spot').fill('40');
  await page.locator('#Ucr_spot').fill('100');
  const card = page.locator('#clcrResultReport .clcr-result-card[data-clcr-series="CaCr_spot"]');
  await expect(card).toBeVisible();
  await expect(page.locator('#clcrResultReport .clcr-result-card:visible')).toHaveCount(1);
  await expect(card).toHaveAttribute('data-clcr-value', '0.4');
  await expect(card).toHaveAttribute('data-clcr-tone', 'warning');
  await expect(card.locator('.clcr-result-value')).toHaveText('0,400');
  await expect(card.locator('.clcr-result-unit')).toHaveText('mg/mg');
  const referenceNumbers = async () => (await card.locator('.clcr-result-reference-value').innerText())
    .match(/\d+(?:[,.]\d+)?/g).map(value => Number(value.replace(',', '.')));
  expect(await referenceNumbers()).toEqual([0.01, 0.3]);
  const source = page.locator('#clcrResultReport .clcr-result-source[data-clcr-formula="CaCr_spot"] a');
  await expect(source.first()).toHaveAttribute('href', /https:\/\/www\.mayocliniclabs\.com\/test-catalog\/Overview\/CACR3/);
  const concentration = JSON.parse(await card.getAttribute('data-clcr-cacr-snapshot'));
  expect(concentration).toMatchObject({ valid: true, mode: 'concentration', rawValue: 0.4, unit: 'mg/mg',
    category: 'above', status: 'above', profileId: 'MAYO_CACR3_RANDOM_2026_10', profileVersion: 1,
    context: { ageYears: 5, sameSpecimen: 'assumed', sampleType: '', confounders: [] },
  });
  await page.getByRole('button', { name: 'Gotowy wynik Ca/Cr', exact: true }).click();
  await page.locator('#CaCr_reported_unit').selectOption('mg/mmol');
  await page.locator('#CaCr_reported').fill('45.248');
  await expect(card).toHaveAttribute('data-clcr-value', '45.248');
  await expect(card).toHaveAttribute('data-clcr-tone', 'warning');
  await expect(card.locator('.clcr-result-unit')).toHaveText('mg/mmol');
  const endpoints = await referenceNumbers();
  expect(endpoints).toHaveLength(2);
  expect(endpoints[0]).toBeCloseTo(1.1312, 3);
  expect(endpoints[1]).toBeCloseTo(33.936, 3);
  await expect(source.first()).toHaveAttribute('href', /https:\/\/www\.mayocliniclabs\.com\/test-catalog\/Overview\/CACR3/);
  const direct = JSON.parse(await card.getAttribute('data-clcr-cacr-snapshot'));
  expect(direct).toMatchObject({ valid: true, mode: 'direct', rawValue: 45.248, unit: 'mg/mmol',
    category: 'above', status: 'above', context: { ageYears: 5, sameSpecimen: 'not-applicable' },
  });
  const details = page.locator('#clcrResultReport .clcr-result-details[data-clcr-formula="CaCr_spot"]');
  await details.locator(':scope > summary').click();
  await expect(details).toContainText(/Mayo|CACR3/);
  await expect(details).toContainText(/orientacyjn|laboratoryjn/);
  await expect(page.locator('#clcrVisitSaveBtn')).toBeDisabled();
  expect(await page.evaluate(() => window.VildaVault.isUnlocked())).toBe(false);
  return { concentration, direct };
}

// A genuinely fresh persistent profile installs the complete production worker.
// The origin is then stopped and Chromium restarted before first visiting the
// calculator. Synthetic values are entered again on a second cold-offline page;
// no claim is made about guest form persistence across browser restarts.
test('Ca/Cr: pełny precache przed pierwszą wizytą i dwa zimne starty offline zachowują normy obu trybów', async ({ playwright, browserName, launchOptions }) => {
  test.setTimeout(180_000);
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'vilda-cacr-offline-'));
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
      const result = await fictionalCacr(offline.page);
      if (expected) expect(result, 'Nowa strona offline odtwarza tę samą ocenę obu trybów').toEqual(expected);
      else expected = result;
      expect(offline.failed, 'Brak nieudanych żądań lokalnych zasobów aplikacji').toEqual([]);
      expect(offline.errors, 'Brak błędów JavaScript po zimnym starcie offline').toEqual([]);
      proof.offlinePages.push({ result, failedApplicationRequests: offline.failed,
        externalRequestFailures: offline.externalFailed, pageErrors: offline.errors });
      await offline.page.close();
    }
    const proofPath = test.info().outputPath('cacr-production-offline-proof.json');
    fs.writeFileSync(proofPath, JSON.stringify(proof, null, 2));
    await test.info().attach('cacr-production-offline-proof', { path: proofPath, contentType: 'application/json' });
  } finally {
    if (context) await context.close();
    await server.stop();
    fs.rmSync(profile, { recursive: true, force: true });
  }
});
