import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';
import { createFictionalVault, fictionalPatient, fixturePreferences, loadPatient, readyForPatient } from '../support/centile-live-fixture.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const BASE = 'e6d91d2e7401f6ca16c29971d6aebb99ac331aa2';
const PASSWORD = 'E2e#SiatkaNowyPomiar!2026';
const DEPENDENCIES = ['bayley_pinneau_data.js', 'rwt_data.js', 'reinehr_cdgp_data.js', 'advanced_growth_kowd.js'];
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const version = bytes => /const SW_VERSION = '([^']+)';/u.exec(bytes.toString())[1];

test.use({ serviceWorkers: 'allow', reducedMotion: 'reduce' });

// The baseline serves Git's exact bytes for every changed path. Unchanged files
// share the working tree; this avoids copying a complete historical deployment.
async function deployment() {
  const changed = execFileSync('git', ['diff', '--name-only', BASE, '--'], { cwd: ROOT, encoding: 'utf8' }).trim().split('\n').filter(Boolean);
  const old = new Map(changed.map(name => {
    try { return [name, execFileSync('git', ['show', `${BASE}:${name}`], { cwd: ROOT, maxBuffer: 8 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'] })]; }
    catch { return [name, null]; }
  }));
  const read = (name, previous) => previous && old.has(name) ? old.get(name) : fs.readFileSync(path.join(ROOT, name));
  const previousVersion = version(read('service-worker-kalorii.js', true));
  const currentVersion = version(read('service-worker-kalorii.js', false));
  expect(currentVersion, 'official resource bump precedes the real upgrade test').not.toBe(previousVersion);
  const resources = [
    { url: '/docpro.html', sha256: sha256(read('docpro.html', false)) },
    ...[...read('docpro.html', false).toString().matchAll(/<script\b[^>]*\bsrc="([^"]+)"/gu)]
      .map(match => match[1]).filter(url => DEPENDENCIES.includes(url.split('?')[0]))
      .map(url => ({ url: '/' + url, sha256: sha256(read(url.split('?')[0], false)) })),
  ];
  expect(resources).toHaveLength(5);
  let promoted = false, stopped = false;
  const types = { '.html': 'text/html', '.js': 'application/javascript', '.json': 'application/json', '.css': 'text/css',
    '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp', '.woff2': 'font/woff2' };
  const server = http.createServer((request, response) => {
    const pathname = decodeURIComponent(new URL(request.url, 'http://127.0.0.1').pathname);
    const name = pathname === '/' ? 'index.html' : pathname.slice(1);
    if (!path.resolve(ROOT, name).startsWith(ROOT + path.sep)) { response.writeHead(403); response.end(); return; }
    try {
      const bytes = read(name, !promoted);
      if (!bytes) { response.writeHead(404); response.end(); return; }
      response.writeHead(200, { 'Content-Type': types[path.extname(name)] || 'application/octet-stream',
        'Cache-Control': name === 'service-worker-kalorii.js' ? 'no-store' : 'no-cache',
        ...(name === 'service-worker-kalorii.js' ? { 'Service-Worker-Allowed': '/' } : {}) });
      response.end(bytes);
    } catch { response.writeHead(404); response.end(); }
  });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  return { origin: `http://127.0.0.1:${server.address().port}`, previousVersion, currentVersion, resources,
    workerSha256: sha256(read('service-worker-kalorii.js', false)), promote() { promoted = true; },
    async stop() {
      if (stopped) return;
      stopped = true;
      await new Promise((resolve, reject) => { server.close(error => error ? reject(error) : resolve()); server.closeIdleConnections(); });
    },
  };
}

async function settled(page) {
  await page.waitForFunction(() => window.VildaVault?.isUnlocked() && window.VildaAuthUI?.isBootReady()
    && window.VildaDataImportExport?.getSaveReadiness().ready
    && !window.VildaDataImportExport.isMainSessionRestorePending()
    && window.VildaSaveStatusIndicator?.isReadyForSharedReference());
}

async function forecast(page) {
  return page.evaluate(() => ({
    final: window.advancedGrowthData?.finalHeightPrediction,
    fresh: window.advGrowthPredictionsMatchCurrentInput?.(),
    row: document.querySelector('#currentSummaryContent .professional-summary-main [data-summary-key="prediction"]')?.textContent,
    state: window.VildaSaveStatusIndicator.getState(),
    reference: window.VildaSaveStatusIndicator.getReferenceFingerprint(),
    patientId: sessionStorage.getItem('vildaCurrentPatientId'),
  }));
}

async function records(page, ids) {
  return page.evaluate(patientIds => Promise.all(patientIds.map(id => window.VildaVault.getPatient(id))), ids);
}

test('DocPro keeps Start forecast after a real PWA upgrade, cold offline restart and reload', async ({ playwright, browserName, launchOptions }, info) => {
  test.setTimeout(240_000);
  const site = await deployment();
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'vilda-docpro-forecast-offline-'));
  const launch = offline => playwright[browserName].launchPersistentContext(profile, {
    ...launchOptions, viewport: { width: 1440, height: 1000 }, baseURL: site.origin, locale: 'pl-PL',
    timezoneId: 'Europe/Warsaw', serviceWorkers: 'allow', reducedMotion: 'reduce', offline,
  });
  let context;
  const proof = { base: BASE, previousVersion: site.previousVersion, currentVersion: site.currentVersion,
    workerSha256: site.workerSha256, resources: site.resources, observations: [] };
  try {
    context = await launch(false);
    let page = await context.newPage();
    const fixture = await createFictionalVault(page);
    const input = fictionalPatient({ firstName: 'PrognozaOffline' });
    input.advanced.boneAgeYears = 12;
    const id = await page.evaluate(async payload => (await window.VildaVault.savePatient(payload, { dedup: false })).patientId, input);
    await loadPatient(page, id, 'restore', { clear: true });
    await settled(page);
    await expect.poll(() => page.evaluate(() => window.advancedGrowthData?.finalHeightPrediction?.cm)).toBeCloseTo(183.69965571730623, 8);
    const before = await forecast(page);
    expect(before.state).toBe('saved');
    expect(before.fresh).toBe(true);
    expect(before.row).toContain('183,7');
    proof.observations.push({ label: 'base Start', ...before });
    const ids = [...Object.values(fixture.ids), id];
    const beforeRecords = await records(page, ids);
    await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller), null, { timeout: 120_000 });
    await expect.poll(() => page.evaluate(() => caches.keys())).toContain('pwa-kalorii-shell-v' + site.previousVersion);
    site.promote();
    await page.evaluate(async () => { await (await navigator.serviceWorker.getRegistration('/')).update(); });
    const refresh = page.locator('#sw-update-banner #sw-refresh');
    await expect(refresh).toBeVisible({ timeout: 60_000 });
    await Promise.all([page.waitForEvent('load'), refresh.click()]);
    await settled(page);
    await expect.poll(() => page.evaluate(() => caches.keys())).toContain('pwa-kalorii-shell-v' + site.currentVersion);
    await expect.poll(() => page.evaluate(() => caches.keys())).not.toContain('pwa-kalorii-shell-v' + site.previousVersion);
    expect(await records(page, ids)).toEqual(beforeRecords);
    await page.evaluate(() => window.VildaVault.lock('manual'));
    await context.close(); context = null;
    await site.stop();
    expect(await fetch(site.origin + '/docpro.html', { signal: AbortSignal.timeout(3000) }).then(() => false, () => true)).toBe(true);

    context = await launch(true);
    page = await context.newPage();
    for (const restored of context.pages()) if (restored !== page) await restored.close();
    const served = new Map();
    page.on('response', response => {
      const url = new URL(response.url());
      if (url.origin === site.origin) served.set(url.pathname + url.search, response.fromServiceWorker());
    });
    await fixturePreferences(page);
    await page.goto('/docpro.html', { waitUntil: 'load' });
    await page.waitForFunction(() => window.VildaVault && window.VildaAuthUI?.isBootReady());
    const login = page.locator('#vilda-auth-ui-root');
    await login.getByRole('button', { name: /Fikcyjny sejf testu panelu siatek/u }).click();
    await login.locator('input[type=password]').fill(PASSWORD);
    await login.getByRole('button', { name: 'Zaloguj się', exact: true }).click();
    await readyForPatient(page);
    const confirm = page.locator('#professionalConfirmBtn');
    if (await confirm.isVisible()) await confirm.click();
    await settled(page);
    await loadPatient(page, id, 'restore', { clear: true });
    await settled(page);
    await expect.poll(async () => (await forecast(page)).row).toBe(before.row);
    const offline = await forecast(page);
    expect(offline.final).toEqual(before.final);
    expect(offline.fresh).toBe(true);
    expect(offline.state).toBe('saved');
    expect(offline.patientId).toBe(id);
    proof.observations.push({ label: 'cold offline DocPro', ...offline });
    for (const resource of site.resources) {
      expect(served.get(resource.url), `${resource.url}: first cold visit served by SW`).toBe(true);
      const actual = await page.evaluate(async url => {
        const response = await fetch(url);
        const digest = await crypto.subtle.digest('SHA-256', await response.arrayBuffer());
        return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
      }, resource.url);
      expect(actual, `${resource.url}: offline bytes match candidate`).toBe(resource.sha256);
    }
    await page.reload({ waitUntil: 'load' });
    await settled(page);
    await expect.poll(() => forecast(page)).toEqual(offline);
    proof.observations.push({ label: 'offline DocPro F5', ...await forecast(page) });
    await page.setViewportSize({ width: 390, height: 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    await expect(page.locator('#currentSummaryContent .professional-summary-main [data-summary-key="prediction"]')).toContainText('183,7');
    expect(await records(page, ids)).toEqual(beforeRecords);
    proof.coldRestart = true; proof.originStopped = true; proof.recordsUnchanged = true;
  } finally {
    await info.attach('docpro-forecast-pwa-proof', { body: JSON.stringify(proof, null, 2), contentType: 'application/json' });
    if (context) await context.close();
    await site.stop();
    fs.rmSync(profile, { recursive: true, force: true });
  }
});
