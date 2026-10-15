import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';
import { czekajNaOdtworzenieSesji } from '../support/sesja-czekanie.mjs';

test.use({ serviceWorkers: 'allow' });
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const moduleNames = ['vilda_lab_testosterone_units.js', 'vilda_lab_testosterone_data.js', 'vilda_lab_testosterone.js',
  'vilda_lab_puberty_ui.js', 'vilda_lab_assessment_ui.js', 'vilda_lab_snapshot.js'];

function resourcesFor(documentName) {
  const html = fs.readFileSync(path.join(root, documentName), 'utf8');
  const scripts = [...html.matchAll(/<script\b[^>]*\bsrc="([^"]+)"[^>]*>/g)].map(match => match[1]);
  return moduleNames.flatMap(name => {
    const resource = scripts.find(url => url.split('?')[0] === name);
    return resource ? [{ url: '/' + resource,
      sha256: createHash('sha256').update(fs.readFileSync(path.join(root, name))).digest('hex') }] : [];
  });
}

async function startServer() {
  const child = spawn(process.execPath, [path.join(root, 'tests/support/static-server.mjs')], {
    env: { ...process.env, PORT: '0' }, stdio: ['ignore', 'pipe', 'inherit'],
  });
  const origin = await new Promise((resolve, reject) => {
    let output = '';
    child.stdout.on('data', chunk => {
      output += chunk;
      const match = /http:\/\/127\.0\.0\.1:(\d+)/.exec(output);
      if (match) resolve(`http://127.0.0.1:${match[1]}`);
    });
    child.once('error', reject);
    child.once('exit', code => reject(new Error(`Static server exited before startup: ${code}`)));
  });
  return { origin, stop: () => new Promise(resolve => {
    if (child.exitCode !== null || child.signalCode !== null) { resolve(); return; }
    child.once('exit', resolve);
    child.kill('SIGKILL');
  }) };
}

async function installProductionWorker(page, origin) {
  await page.goto(`${origin}/tests/fixtures/service-worker-runner.html`);
  const state = await page.evaluate(async () => {
    const registration = await navigator.serviceWorker.register('/service-worker-kalorii.js', { scope: '/' });
    const worker = registration.installing || registration.waiting || registration.active;
    const finished = () => ['activated', 'redundant'].includes(worker.state);
    if (!finished()) await new Promise(resolve => {
      worker.addEventListener('statechange', () => { if (finished()) resolve(); });
    });
    return worker.state;
  });
  expect(state, 'complete, unmodified production SW installation and activation').toBe('activated');
}

// Exercise the actual update lifecycle with the complete production precache.
// The preceding installation differs only in its SW_VERSION; it is not claimed
// to reproduce an archived clinical release. After promotion the SW response is
// the exact file in this checkout, and offline module bytes are verified below.
async function startUpdateProxy(upstream) {
  const current = fs.readFileSync(path.join(root, 'service-worker-kalorii.js'), 'utf8');
  const version = /const SW_VERSION = '([^']+)'/.exec(current)[1];
  const pieces = version.split('.').map(Number);
  pieces[pieces.length - 1] -= 1;
  const previousVersion = pieces.join('.');
  const previous = current.replace(`const SW_VERSION = '${version}'`, `const SW_VERSION = '${previousVersion}'`);
  let promoted = false;
  const proxy = http.createServer(async (request, response) => {
    try {
      if (!promoted && new URL(request.url, upstream).pathname === '/service-worker-kalorii.js') {
        response.writeHead(200, { 'Content-Type': 'text/javascript; charset=utf-8', 'Cache-Control': 'no-store', 'Service-Worker-Allowed': '/' });
        response.end(previous);
        return;
      }
      const source = await fetch(new URL(request.url, upstream));
      response.writeHead(source.status, Object.fromEntries(source.headers));
      response.end(Buffer.from(await source.arrayBuffer()));
    } catch (_) {
      response.writeHead(502);
      response.end();
    }
  });
  await new Promise((resolve, reject) => {
    proxy.once('error', reject);
    proxy.listen(0, '127.0.0.1', resolve);
  });
  return { origin: `http://127.0.0.1:${proxy.address().port}`, version, previousVersion,
    promote: () => { promoted = true; },
    stop: () => new Promise(resolve => { proxy.close(resolve); proxy.closeAllConnections(); }),
  };
}

async function updateProductionWorker(page, proxy) {
  const before = await page.evaluate(() => caches.keys());
  expect(before.some(key => key.endsWith(`-shell-v${proxy.previousVersion}`))).toBe(true);
  proxy.promote();
  const state = await page.evaluate(async () => {
    const registration = await navigator.serviceWorker.getRegistration('/');
    const oldWorker = registration.active;
    await registration.update();
    const worker = registration.installing || registration.waiting;
    if (!worker || worker === oldWorker) throw new Error('The production worker did not begin an update');
    if (!['installed', 'activated', 'redundant'].includes(worker.state)) await new Promise(resolve => {
      worker.addEventListener('statechange', () => {
        if (['installed', 'activated', 'redundant'].includes(worker.state)) resolve();
      });
    });
    if (worker.state === 'installed') worker.postMessage({ type: 'SKIP_WAITING' });
    if (!['activated', 'redundant'].includes(worker.state)) await new Promise(resolve => {
      worker.addEventListener('statechange', () => {
        if (['activated', 'redundant'].includes(worker.state)) resolve();
      });
    });
    return worker.state;
  });
  expect(state, 'the complete current production SW replaces the preceding active worker').toBe('activated');
  await expect.poll(() => page.evaluate(oldVersion => caches.keys().then(keys =>
    keys.some(key => key.endsWith(`-shell-v${oldVersion}`))), proxy.previousVersion)).toBe(false);
  expect((await page.evaluate(() => caches.keys())).some(key => key.endsWith(`-shell-v${proxy.version}`))).toBe(true);
}

async function expectOfflineBytes(page, resources, loaded) {
  for (const resource of resources) {
    expect(loaded.get(resource.url), `${resource.url} loaded through the production SW`).toBe(true);
    const hash = await page.evaluate(async url => {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`Missing cached ${url}: ${response.status}`);
      const digest = await crypto.subtle.digest('SHA-256', await response.arrayBuffer());
      return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
    }, resource.url);
    expect(hash, `offline bytes are the current production module: ${resource.url}`).toBe(resource.sha256);
  }
}

async function guest(page) {
  const consent = page.locator('#consent-decline');
  if (await consent.isVisible()) await consent.click();
  const button = page.getByRole('button', { name: 'Korzystaj bez logowania', exact: true });
  if (await button.isVisible()) await button.click();
}

async function mainObservation(page, sex = 'M') {
  await page.waitForFunction(() => window.VildaPubertyAssessmentState && window.VildaPubertyAssessmentUI);
  await czekajNaOdtworzenieSesji(page);
  await guest(page);
  await page.waitForFunction(() => !window.__vildaPersistRestoring &&
    !window.VildaPersistence.isClearInProgress() && !(Number(window.__vildaPersistClearUntil || 0) > Date.now()));
  await page.locator('#sex').selectOption(sex);
  await page.locator('#age').fill(sex === 'F' ? '15' : '12');
  await page.locator('#ageMonths').fill('0');
  if (await page.locator('#tannerToggleBtn').getAttribute('aria-expanded') !== 'true') await page.locator('#tannerToggleBtn').click();
  const axis = sex === 'F' ? 'Th' : 'G';
  await page.locator(`#pubertyAssessmentEditor .vpa-segments [data-puberty-axis="${axis}"][data-puberty-stage="3"]`).click();
  if (sex === 'F') await page.locator('#pubertyAssessmentEditor .vpa-segments [data-puberty-axis="P"][data-puberty-stage="5"]').click();
  await expect.poll(() => page.evaluate(kind => window.VildaPubertyAssessmentState.read().assessment?.observations?.[kind]?.stage, axis)).toBe(3);
  await page.evaluate(() => {
    window.vildaPersistFlushNow?.({ force: true });
    window.VildaDataImportExport.saveMainSessionNow();
  });
}

async function chooseTestosterone(page, raw = '300') {
  await page.locator('#labSubstance').fill('Testosteron');
  await page.locator('#labSubstanceDropdown [data-id="testosterone_total"]').click();
  await page.locator('#labUnit').selectOption('ng/dL');
  await page.locator('#labUnitTarget').selectOption('nmol/L');
  await page.locator('#labValue').fill(raw);
}

const evaluation = page => page.evaluate(() => window.VildaLabPubertyRuntime.getAssessment()?.evaluation);
const host = page => page.locator('#labPubertyAssessment .vilda-lab-assessment');

async function expectSimpleComparison(page) {
  await expect(page.locator('#labPubertyPanel')).toBeVisible();
  await expect(page.locator('#labPubertyStageSummary')).toContainText('G3');
  await expect(page.locator('#labPubertyPatientSummary')).toContainText('12');
  await expect(page.locator('#labStep4')).toBeHidden();
  await expect(page.locator('#labPubertySectionPatient')).toBeHidden();
  await expect(page.locator('#labPubertySharedEditor')).toBeHidden();
  await expect(page.locator('#labPubertyConfiguredProfile, #labPubertyMethodConfirmed, #labPubertyOpenDate, #labPubertyOpenRange')).toHaveCount(0);
  for (const axis of ['age', 'stage']) {
    await expect(host(page).locator(`[data-comparison="${axis}"]`)).toHaveAttribute('data-status', 'within');
    await expect(host(page).locator(`[data-comparison="${axis}"]`)).toHaveAttribute('data-applicability', 'source-reference');
  }
  const result = await evaluation(page);
  expect(result.input).toMatchObject({ sex: 'M', referenceSelection: 'automatic', age: { years: 12, months: 0 },
    puberty: { kind: 'G', stage: 3, appliesToCurrentContext: true }, specimen: 'unknown', assay: { confirmation: 'unknown' } });
  expect(result.measurement).toMatchObject({ unit: 'nmol/L', sourceValue: 300, sourceUnit: 'ng/dL', isExact: true });
  expect(result.measurement.value).toBeCloseTo(10.401, 10);
  await expect(page.locator('#labResultBig .lab-result-big-value')).toHaveText(/10[,.]401/);
  await expect(page.locator('#labResultBig .lab-result-big-unit')).toHaveText('nmol/L');
  await expect.poll(async () => Number(await page.locator('#labHormoneLifespan [data-patient-concentration="t"]').getAttribute('data-value')))
    .toBeCloseTo(10.401, 10);
  await expect(host(page).getByText('Szczegóły i źródła', { exact: true })).toBeVisible();
  await host(page).getByText('Szczegóły i źródła', { exact: true }).click();
  await expect(host(page).locator('a[href*="mayocliniclabs.com/test-catalog/Overview/8533"]')).not.toHaveCount(0);
  await expect(host(page)).toContainText(/LC-MS\/MS/);
  await host(page).getByText('Szczegóły i źródła', { exact: true }).click();
  return result;
}

async function expectFemaleComparison(page) {
  const age = host(page).locator('[data-comparison="age"]');
  const axis = age.locator('.vilda-lab-axis');
  await expect(age).toHaveAttribute('data-status', 'within');
  await expect(axis).toHaveAttribute('data-range-lower', 'unknown');
  await expect.poll(async () => Number(await axis.getAttribute('data-range-upper'))).toBeCloseTo(2.60025, 7);
  await expect(host(page).locator('[data-comparison="stage"] .vilda-lab-axis')).toHaveCount(0);
  await expect(page.locator('#labPubertyRefineStage')).toBeHidden();
  await expect(page.locator('#labStep4')).toBeHidden();
  const result = await evaluation(page);
  expect(result.input).toMatchObject({ sex: 'F', age: { years: 15, months: 0 }, puberty: { kind: 'Th', stage: 3 } });
  expect(result.provenance.profileId).toBe('mayo-ttst-female');
  expect(result.provenance.sourceIds).toContain('mayo-ttst-8533-female');
  expect(result.measurement).toMatchObject({ unit: 'nmol/L', sourceValue: 75, sourceUnit: 'ng/dL', isExact: true });
  expect(result.measurement.value).toBeCloseTo(2.60025, 10);
  await expect(page.locator('#labResultBig')).toContainText('2,60025');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  return result;
}

// A clean persistent profile installs the complete production precache. The
// origin is then physically stopped and the browser restarted. Only after that
// do we enter fictional visit data and first open the clinical converter. No
// HTTP/document cache and no real vault can hide missing PWA dependencies.
for (const upgrade of [false, true]) test(`TT women and male control survive ${upgrade ? 'a production SW update and' : 'installation and'} cold offline restart at 320 px`, async ({ playwright, browserName, launchOptions }) => {
  test.setTimeout(180_000);
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'vilda-testosterone-offline-'));
  const server = await startServer();
  const proxy = upgrade ? await startUpdateProxy(server.origin) : null;
  const origin = proxy ? proxy.origin : server.origin;
  const resources = resourcesFor('przelicznik-jednostek.html');
  expect(resources, 'TT source, engine, units, renderer, form and snapshot are wired to the converter').toHaveLength(6);
  const launch = () => playwright[browserName].launchPersistentContext(profile, {
    ...launchOptions, serviceWorkers: 'allow', locale: 'pl-PL', timezoneId: 'Europe/Warsaw',
    viewport: { width: 320, height: 900 },
  });
  let context;
  try {
    context = await launch();
    const installer = context.pages()[0] || await context.newPage();
    await installProductionWorker(installer, origin);
    if (proxy) await updateProductionWorker(installer, proxy);
    await context.close();
    context = null;
    if (proxy) await proxy.stop();
    await server.stop();

    context = await launch();
    await context.addInitScript(() => {
      localStorage.setItem('vilda-terms-accepted-v1', JSON.stringify({ version: 1, acceptedAtISO: new Date().toISOString() }));
      const now = new Date();
      const day = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
      localStorage.setItem('vilda-reminders-shown-v1', `${day}|${Date.now()}`);
      localStorage.setItem('vilda-reminders-closed-v1', `${day}|${Date.now()}`);
    });
    const page = context.pages()[0] || await context.newPage();
    const loaded = new Map();
    page.on('response', response => {
      const url = new URL(response.url());
      if (resources.some(resource => resource.url === url.pathname + url.search))
        loaded.set(url.pathname + url.search, response.fromServiceWorker());
    });
    const noNetwork = () => page.evaluate(() => fetch(`/__tt-offline-probe-${Date.now()}`).then(() => false, () => true));
    await page.goto(`${origin}/index.html`, { waitUntil: 'load' });
    expect(await noNetwork(), 'the origin is unavailable before any clinical data entry').toBe(true);
    await mainObservation(page);

    await page.goto(`${origin}/przelicznik-jednostek.html`, { waitUntil: 'load' });
    await page.waitForFunction(() => window.VildaLabTestosterone && window.VildaLabTestosteroneData &&
      window.VildaLabTestosteroneUnits && window.VildaLabSnapshot && window.VildaLabPubertyRuntime);
    await guest(page);
    await expectOfflineBytes(page, resources, loaded);
    await chooseTestosterone(page);
    const before = await expectSimpleComparison(page);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
      'the result and source comparison fit a 320 px viewport').toBe(true);

    await page.reload({ waitUntil: 'load' });
    await page.waitForFunction(() => window.VildaLabPubertyRuntime && window.VildaLabTestosterone);
    await chooseTestosterone(page);
    const after = await expectSimpleComparison(page);
    expect(after, 'offline F5 retains the same source comparisons and current G context').toEqual(before);
    const populationPath = await page.locator('#labHormoneLifespan [data-stable-reference-line="t"]').getAttribute('d');

    await page.locator('#labValue').fill('<7');
    const censored = await evaluation(page);
    expect(censored.measurement).toMatchObject({ operator: '<', sourceValue: 7, sourceUnit: 'ng/dL', isExact: false, plotValue: null });
    await expect(page.locator('#labResultBig .lab-result-big-value')).toHaveText(/<\s*0[,.]24269/);
    await expect(host(page).locator('.vilda-lab-axis-marker')).toHaveCount(0);
    await expect(page.locator('#labHormoneLifespan [data-patient-concentration="t"] [data-result-point]')).toHaveCount(0);
    await expect(page.locator('#labHormoneLifespan [data-stable-reference-line="t"]')).toHaveAttribute('d', populationPath);
    await page.goto(`${origin}/index.html`, { waitUntil: 'load' });
    await mainObservation(page, 'F');
    await page.goto(`${origin}/przelicznik-jednostek.html`, { waitUntil: 'load' });
    await page.waitForFunction(() => window.VildaLabPubertyRuntime && window.VildaLabTestosterone);
    await chooseTestosterone(page, '75');
    const femaleBefore = await expectFemaleComparison(page);
    await page.reload({ waitUntil: 'load' });
    await page.waitForFunction(() => window.VildaLabPubertyRuntime && window.VildaLabTestosterone);
    await chooseTestosterone(page, '75');
    expect(await expectFemaleComparison(page), 'offline F5 retains the female age reference and independent Th context').toEqual(femaleBefore);
    await expectOfflineBytes(page, resources, loaded);
    for (const raw of ['<7', '<LOD']) {
      await page.locator('#labValue').fill(raw);
      expect((await evaluation(page)).measurement).toMatchObject({ raw, operator: '<', isExact: false, plotValue: null });
      await expect(host(page).locator('.vilda-lab-axis-marker')).toHaveCount(0);
      await expect(page.locator('#labResultBig')).toContainText(raw === '<7' ? /<\s*0[,.]24269/ : '<LOD');
    }
    expect(await noNetwork(), 'male age/G, female age, source conversion and censored results all remain offline').toBe(true);
  } finally {
    if (context) await context.close();
    if (proxy) await proxy.stop();
    await server.stop();
    fs.rmSync(profile, { recursive: true, force: true });
  }
});
