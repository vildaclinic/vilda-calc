import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';
import { createFictionalVault, fixturePreferences, loadPatient, readyForPatient, shellFrame } from '../support/centile-live-fixture.mjs';
import { czekajNaOdtworzenieSesji } from '../support/sesja-czekanie.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const BASE = '6e92f5f41c9f37b044bfd0925030e3f6d135b31b';
const PASSWORD = 'E2e#SiatkaNowyPomiar!2026';
const PAGES = ['app.html', 'index.html', 'docpro.html', 'terminarz.html'];
const SCRIPTS = ['vilda_html.js', 'vilda_patient_report.js', 'nutrition_norms.js', 'vilda_update_prep.js',
  'vilda_shell.js', 'vilda_vault.js', 'vilda_terminarz.js'];
const PROBE = '/__navigation-offline-probe-';
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const workerVersion = tree => /const SW_VERSION = '([^']+)';/.exec(fs.readFileSync(path.join(tree, 'service-worker-kalorii.js'), 'utf8'))[1];

test.use({ serviceWorkers: 'allow', reducedMotion: 'reduce' });

function resources(tree) {
  const pages = PAGES.map(name => ({ name, bytes: fs.readFileSync(path.join(tree, name)) }));
  const references = pages.flatMap(page => [...page.bytes.toString('utf8')
    .matchAll(/["']([^"'\s]+\.js\?v=\d+)["']/g)].map(match => match[1]));
  return [
    ...pages.map(page => ({ url: '/' + page.name, sha256: hash(page.bytes) })),
    ...SCRIPTS.map(name => {
      const versions = [...new Set(references.filter(value => value.split('?')[0] === name))];
      if (versions.length !== 1) throw new Error('Expected one current URL for ' + name);
      return { url: '/' + versions[0], sha256: hash(fs.readFileSync(path.join(tree, name))) };
    }),
  ];
}

async function deployment() {
  const baseline = fs.mkdtempSync(path.join(os.tmpdir(), 'vilda-navigation-base-'));
  try {
    const archive = execFileSync('git', ['archive', '--format=tar', BASE], { cwd: ROOT, maxBuffer: 128 * 1024 * 1024 });
    execFileSync('tar', ['-x', '-C', baseline], { input: archive });
  } catch (error) {
    fs.rmSync(baseline, { recursive: true, force: true });
    throw error;
  }
  const previousVersion = workerVersion(baseline), currentVersion = workerVersion(ROOT);
  if (previousVersion === currentVersion) {
    fs.rmSync(baseline, { recursive: true, force: true });
    throw new Error('Run the official resource version bump before this update test');
  }
  let promoted = false;
  const responses = [];
  const types = { '.html': 'text/html', '.js': 'application/javascript', '.json': 'application/json',
    '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp', '.woff2': 'font/woff2' };
  const server = http.createServer((request, response) => {
    const pathname = decodeURIComponent(new URL(request.url, 'http://127.0.0.1').pathname);
    const tree = promoted ? ROOT : baseline;
    const file = path.resolve(tree, '.' + (pathname === '/' ? '/index.html' : pathname));
    if (!file.startsWith(tree + path.sep)) { response.writeHead(403); response.end(); return; }
    fs.stat(file, (error, stat) => {
      if (error || !stat.isFile()) { responses.push({ pathname, status: 404 }); response.writeHead(404); response.end(); return; }
      responses.push({ pathname, status: 200, type: types[path.extname(file)] || 'application/octet-stream' });
      response.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream',
        'Cache-Control': pathname === '/service-worker-kalorii.js' ? 'no-store' : 'no-cache',
        ...(pathname === '/service-worker-kalorii.js' ? { 'Service-Worker-Allowed': '/' } : {}) });
      fs.createReadStream(file).pipe(response);
    });
  });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  let stopped = false;
  return {
    origin: `http://127.0.0.1:${server.address().port}`, previousVersion, currentVersion, responses,
    oldResources: resources(baseline), newResources: resources(ROOT),
    promote() { promoted = true; },
    async stop() {
      if (stopped) return;
      stopped = true;
      await new Promise((resolve, reject) => { server.close(error => error ? reject(error) : resolve()); server.closeIdleConnections(); });
    },
    async cleanup() { await this.stop(); fs.rmSync(baseline, { recursive: true, force: true }); },
  };
}

async function activate(page, update = false) {
  return page.evaluate(async updating => {
    const registration = updating ? await navigator.serviceWorker.getRegistration('/')
      : await navigator.serviceWorker.register('/service-worker-kalorii.js', { scope: '/' });
    const previous = updating ? registration.active : null;
    if (updating) await registration.update();
    const worker = registration.installing || registration.waiting || registration.active;
    if (!worker || worker === previous) throw new Error('Expected a new production service worker');
    const wait = states => new Promise(resolve => {
      if (states.includes(worker.state)) { resolve(); return; }
      worker.addEventListener('statechange', () => { if (states.includes(worker.state)) resolve(); });
    });
    await wait(['installed', 'activated', 'redundant']);
    if (worker.state === 'installed') worker.postMessage({ type: 'SKIP_WAITING' });
    await wait(['activated', 'redundant']);
    return worker.state;
  }, update);
}

async function cached(page, version, expected) {
  const actual = await page.evaluate(async ({ version, urls }) => {
    const cache = await caches.open('pwa-kalorii-shell-v' + version);
    return Promise.all(urls.map(async url => {
      const response = await cache.match(url);
      if (!response?.ok) return { url, sha256: null };
      const bytes = await crypto.subtle.digest('SHA-256', await response.arrayBuffer());
      return { url, sha256: [...new Uint8Array(bytes)].map(byte => byte.toString(16).padStart(2, '0')).join('') };
    }));
  }, { version, urls: expected.map(item => item.url) });
  expect(actual).toEqual(expected);
}

async function recordFingerprint(owner, ids) {
  return owner.evaluate(async patientIds => {
    // Entire public records, including all stored snapshot payloads and headers;
    // no clinical field or timestamp is removed from this comparison.
    const records = await Promise.all(patientIds.map(id => window.VildaVault.getPatient(id)));
    const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(records)));
    return [...new Uint8Array(bytes)].map(byte => byte.toString(16).padStart(2, '0')).join('');
  }, ids);
}

async function clinicalView(owner) {
  return owner.evaluate(() => ({
    patientId: sessionStorage.getItem('vildaCurrentPatientId'),
    fields: Object.fromEntries(['age', 'ageMonths', 'sex', 'weight', 'height'].map(id => [id, document.getElementById(id)?.value])),
    lines: window.getFormattedProfessionalSummaryLines(),
    rows: Array.from(document.querySelectorAll('#currentSummaryContent .professional-summary-row'), node => ({
      key: node.dataset.summaryKey, tone: node.dataset.tone, assessment: node.dataset.assessment,
      text: node.textContent, background: getComputedStyle(node).backgroundColor,
    })),
  }));
}

async function navigate(page, route, title) {
  await page.evaluate(value => window.VildaShell.navigate(value, false), route);
  const owner = await shellFrame(page, title);
  await owner.waitForFunction(() => window.frameElement?.hidden === false);
  return owner;
}

test('navigation updates real cached assets and preserves the patient through a cold offline route round trip', async ({ playwright, browserName, launchOptions }, info) => {
  test.setTimeout(240_000);
  const site = await deployment();
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'vilda-navigation-offline-'));
  let context;
  const launch = offline => playwright[browserName].launchPersistentContext(profile, {
    ...launchOptions, viewport: { width: 1440, height: 1000 }, baseURL: site.origin,
    locale: 'pl-PL', timezoneId: 'Europe/Warsaw', serviceWorkers: 'allow', reducedMotion: 'reduce', offline,
  });
  try {
    context = await launch(false);
    let installer = await context.newPage();
    await installer.goto('/tests/fixtures/service-worker-runner.html');
    expect(await activate(installer), JSON.stringify(site.responses)).toBe('activated');
    await cached(installer, site.previousVersion, site.oldResources);
    const fixture = await createFictionalVault(installer);
    await loadPatient(installer, fixture.ids.a, 'restore');
    await czekajNaOdtworzenieSesji(installer);
    await expect(installer.locator('#currentSummaryContent .professional-summary-main')).toBeVisible();
    const ids = Object.values(fixture.ids);
    const fingerprint = await recordFingerprint(installer, ids);
    const expected = await clinicalView(installer);
    const userId = await installer.evaluate(() => window.VildaVault.getCurrentUser().userId);
    await installer.evaluate(() => { window.vildaPersistFlushNow({ force: true }); window.VildaVault.lock('manual'); });
    await installer.goto('/tests/fixtures/service-worker-runner.html');
    site.promote();
    expect(await activate(installer, true)).toBe('activated');
    await cached(installer, site.currentVersion, site.newResources);
    await expect.poll(() => installer.evaluate(() => caches.keys())).not.toContain('pwa-kalorii-shell-v' + site.previousVersion);
    await context.close(); context = null;
    await site.stop();
    expect(await fetch(site.origin + '/app.html', { signal: AbortSignal.timeout(3000) }).then(() => false, () => true)).toBe(true);

    context = await launch(true);
    const page = await context.newPage();
    for (const restored of context.pages()) if (restored !== page) await restored.close();
    const served = new Map(), failures = [], errors = [];
    page.on('response', response => {
      const url = new URL(response.url());
      if (url.origin === site.origin) served.set(url.pathname + (url.pathname.endsWith('.html') ? '' : url.search), response.fromServiceWorker());
    });
    page.on('requestfailed', request => {
      const url = new URL(request.url());
      if (url.origin === site.origin && !url.pathname.startsWith(PROBE)) failures.push(request.url());
    });
    page.on('pageerror', error => errors.push(error.message));
    await fixturePreferences(page);
    await page.goto('/app.html#/start', { waitUntil: 'load' });
    await page.waitForFunction(() => window.VildaVault && window.VildaAuthUI?.isBootReady());
    expect(await page.evaluate(() => window.VildaVault.isUnlocked())).toBe(false);
    const login = page.locator('#vilda-auth-ui-root');
    await login.getByRole('button', { name: /Fikcyjny sejf testu panelu siatek/ }).click();
    await login.locator('input[type=password]').fill(PASSWORD);
    await login.getByRole('button', { name: 'Zaloguj się', exact: true }).click();
    let owner = await shellFrame(page);
    await readyForPatient(owner);
    expect(await owner.evaluate(() => window.VildaVault.getCurrentUser().userId)).toBe(userId);
    await loadPatient(owner, fixture.ids.a, 'restore');
    await czekajNaOdtworzenieSesji(owner);
    await expect.poll(() => clinicalView(owner)).toEqual(expected);
    expect(await page.evaluate(prefix => fetch(prefix + Date.now()).then(() => false, () => true), PROBE)).toBe(true);

    owner = await navigate(page, 'docpro', 'DocPro');
    await readyForPatient(owner);
    await expect(owner.locator('#weight')).toHaveValue(expected.fields.weight);
    await expect(owner.locator('#height')).toHaveValue(expected.fields.height);
    expect(await owner.evaluate(() => sessionStorage.getItem('vildaCurrentPatientId'))).toBe(fixture.ids.a);
    owner = await navigate(page, 'lab', 'Jednostki laboratoryjne');
    await owner.waitForFunction(() => window.LabUnitConverter && document.getElementById('labSubstance'));
    await expect(owner.locator('#labSubstance')).toBeVisible();
    expect(await owner.evaluate(() => sessionStorage.getItem('vildaCurrentPatientId'))).toBe(fixture.ids.a);
    owner = await navigate(page, 'klirens', 'Kalkulator klirensu');
    await owner.waitForFunction(() => window.VildaVault?.isUnlocked() && typeof window.clcrUpdate === 'function');
    await expect(owner.locator('#height')).toHaveValue(expected.fields.height);
    await expect(owner.locator('#weight')).toHaveValue(expected.fields.weight);
    owner = await navigate(page, 'terminarz', 'Terminarz');
    await owner.waitForFunction(() => window.VildaTerminarz && window.VildaVault?.isUnlocked()
      && document.querySelector('#terminarzRoot button'));
    await expect(owner.locator('#terminarzRoot')).toBeVisible();
    expect(await owner.evaluate(() => sessionStorage.getItem('vildaCurrentPatientId'))).toBe(fixture.ids.a);
    owner = await navigate(page, 'start', 'Start');
    await readyForPatient(owner);
    await expect.poll(() => clinicalView(owner)).toEqual(expected);
    expect(await recordFingerprint(owner, ids)).toBe(fingerprint);

    for (const asset of site.newResources) {
      expect(served.get(asset.url), asset.url + ' executed from the updated offline cache').toBe(true);
      const bytes = await page.evaluate(async url => {
        const response = await fetch(url);
        if (!response.ok) throw new Error('Missing offline resource: ' + url);
        const digest = await crypto.subtle.digest('SHA-256', await response.arrayBuffer());
        return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
      }, asset.url);
      expect(bytes, asset.url).toBe(asset.sha256);
    }
    expect(errors).toEqual([]);
    expect(failures).toEqual([]);
    const desktop = info.outputPath('navigation-offline-desktop.png');
    await page.screenshot({ path: desktop, scale: 'css' });
    await info.attach('navigation-offline-desktop', { path: desktop, contentType: 'image/png' });
    await page.setViewportSize({ width: 390, height: 852 });
    await owner.evaluate(() => new Promise(resolve => { requestAnimationFrame(() => requestAnimationFrame(resolve)); }));
    await expect.poll(() => clinicalView(owner)).toEqual(expected);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
    expect(await owner.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
    const mobile = info.outputPath('navigation-offline-mobile.png');
    await page.screenshot({ path: mobile, scale: 'css' });
    await info.attach('navigation-offline-mobile', { path: mobile, contentType: 'image/png' });
    const proof = info.outputPath('navigation-cold-offline-proof.json');
    fs.writeFileSync(proof, JSON.stringify({ base: BASE, previousVersion: site.previousVersion,
      currentVersion: site.currentVersion, realProductionUpgrade: true, coldRestart: true, originStopped: true,
      unchangedFullRecordFingerprint: fingerprint, userId, expectedClinicalView: expected, resources: site.newResources,
    }, null, 2));
    await info.attach('navigation-cold-offline-proof', { path: proof, contentType: 'application/json' });
  } finally {
    if (context) await context.close().catch(() => {});
    await site.cleanup();
    fs.rmSync(profile, { recursive: true, force: true });
  }
});
