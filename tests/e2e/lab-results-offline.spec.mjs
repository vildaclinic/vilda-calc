import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';
import { otworzBadania, otworzSejf, sekcjaBadan, zapiszHistorie } from '../support/lab-historia-dane.mjs';

// Only fictional vault records. Install the complete production worker, close
// Chromium, remove the HTTP origin, then log in to the previously saved vault.
test.use({ serviceWorkers: 'allow', reducedMotion: 'reduce' });
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const password = 'E2e#Badania!2026';
const probePrefix = '/__lab-results-offline-probe-';
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const result = (lab, id) => lab.locator(`.vilda-lab-hist-result-row[data-note-id="${id}"]`);

function resources() {
  const html = fs.readFileSync(path.join(root, 'index.html'));
  const urls = [...html.toString().matchAll(/\b(?:src|href)="([^"]+)"/g)].map(match => match[1]);
  return [{ url: '/index.html', sha256: hash(html) }, ...[
    'vilda_lab_result_presentation.js', 'vilda_lab_result_chart.js',
    'vilda_lab_history.js', 'vilda_lab_history_tab.js', 'vilda_lab_history_tab.css',
  ].map(file => {
    const url = urls.find(value => value.split('?')[0] === file);
    if (!url) throw new Error(`Production index does not load ${file}`);
    return { url: '/' + url, sha256: hash(fs.readFileSync(path.join(root, file))) };
  })];
}

async function ownServer() {
  const child = spawn(process.execPath, [path.join(root, 'tests/support/static-server.mjs')], {
    env: { ...process.env, PORT: '0' }, stdio: ['ignore', 'pipe', 'inherit'],
  });
  const origin = await new Promise((resolve, reject) => {
    let output = '';
    child.stdout.on('data', bytes => {
      output += bytes;
      const match = /http:\/\/127\.0\.0\.1:\d+/.exec(output);
      if (match) resolve(match[0]);
    });
    child.once('error', reject);
    child.once('exit', code => reject(new Error(`Laboratory offline server exited before startup (${code})`)));
  });
  return { origin, stop: () => new Promise(resolve => {
    if (child.exitCode !== null || child.signalCode !== null) { resolve(); return; }
    child.once('exit', resolve); child.kill('SIGKILL');
  }) };
}

async function preferences(context) {
  await context.addInitScript(() => {
    localStorage.setItem('vilda-terms-accepted-v1', JSON.stringify({ version: 1, acceptedAtISO: new Date().toISOString() }));
    const d = new Date();
    const date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    for (const key of ['vilda-reminders-shown-v1', 'vilda-reminders-closed-v1']) localStorage.setItem(key, `${date}|${Date.now()}`);
  });
}

async function notes(page, patientId) {
  return page.evaluate(async id => (await window.VildaVault.listPatientNotesForPatient(id)).sort((a, b) => a.id.localeCompare(b.id)), patientId);
}

test('Badania: zapisane wyniki, normy i kolory po zimnym uruchomieniu produkcyjnej PWA bez sieci', async ({ playwright, browserName, launchOptions }, testInfo) => {
  // Full production precache and two separate browser processes, matching the
  // existing cold-PWA history regression rather than a warm reload fixture.
  test.setTimeout(180_000);
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'vilda-lab-results-offline-'));
  const server = await ownServer();
  const currentResources = resources();
  const workerBytes = fs.readFileSync(path.join(root, 'service-worker-kalorii.js'));
  const version = /const SW_VERSION = '([^']+)'/.exec(workerBytes.toString())[1];
  const launch = offline => playwright[browserName].launchPersistentContext(profile, {
    ...launchOptions, baseURL: server.origin, offline, serviceWorkers: 'allow', reducedMotion: 'reduce',
    locale: 'pl-PL', timezoneId: 'Europe/Warsaw', viewport: { width: 390, height: 1000 },
  });
  let context;
  try {
    context = await launch(false);
    const installer = context.pages()[0] || await context.newPage();
    await installer.goto('/tests/fixtures/service-worker-runner.html');
    expect(await installer.evaluate(async () => {
      const registration = await navigator.serviceWorker.register('/service-worker-kalorii.js', { scope: '/' });
      const worker = registration.installing || registration.waiting || registration.active;
      if (!['activated', 'redundant'].includes(worker.state)) await new Promise(resolve => {
        worker.addEventListener('statechange', () => { if (['activated', 'redundant'].includes(worker.state)) resolve(); });
      });
      return worker.state;
    })).toBe('activated');
    expect(await installer.evaluate(() => caches.keys())).toContain(`pwa-kalorii-shell-v${version}`);

    const patientId = await otworzSejf(installer, server.origin + '/index.html');
    const ids = await zapiszHistorie(installer, patientId);
    const duplicate = await installer.evaluate(async id => (await window.VildaVault.savePatientNote({
      patientId: id, title: 'Fikcyjne powtórne TSH tego samego dnia', body: '', category: 'wynik-badania', clinicalDateISO: '2026-06-02',
      labResult: { test: 'TSH (tyreotropina)', testKey: 'tsh', value: '0,12', valueNum: 0.12, unit: 'mIU/L', norm: '0,27–4,2 mIU/L' },
    })).id, patientId);
    const before = await notes(installer, patientId);
    const userId = await installer.evaluate(() => window.VildaVault.getCurrentUser().userId);
    await installer.evaluate(() => window.VildaVault.lock('manual'));
    await installer.waitForFunction(() => !window.VildaVault.isUnlocked());
    await context.close(); context = null;
    await server.stop();
    expect(await fetch(server.origin + '/index.html', { signal: AbortSignal.timeout(3000) }).then(() => false, () => true)).toBe(true);

    context = await launch(true);
    await preferences(context);
    const page = context.pages()[0] || await context.newPage();
    const served = new Map(), failed = [], errors = [];
    page.on('response', response => {
      const url = new URL(response.url());
      if (url.origin === server.origin) served.set(url.pathname + url.search, response.fromServiceWorker());
    });
    page.on('requestfailed', request => {
      const url = new URL(request.url());
      if (url.origin !== server.origin || url.pathname.startsWith(probePrefix) || request.failure()?.errorText === 'net::ERR_ABORTED') return;
      failed.push(url.pathname + url.search + ': ' + request.failure()?.errorText);
    });
    page.on('pageerror', error => errors.push(error.message));
    await page.goto('/index.html', { waitUntil: 'load' });
    await page.waitForFunction(() => window.VildaVault && window.VildaAuthUI?.isBootReady());
    expect(await page.evaluate(() => window.VildaVault.isUnlocked())).toBe(false);
    expect(await page.evaluate(async id => (await window.VildaVault.listUsers()).some(user => user.userId === id), userId)).toBe(true);
    const auth = page.locator('#vilda-auth-ui-root');
    await auth.getByRole('button', { name: /Fikcyjny sejf badań/ }).click();
    await auth.locator('input[type=password]').fill(password);
    await auth.getByRole('button', { name: 'Zaloguj się', exact: true }).click();
    await page.waitForFunction(() => window.VildaVault?.isUnlocked() && window.VildaAuthUI?.isBootReady()
      && !document.documentElement.classList.contains('vilda-auth-locked'));
    expect(await page.evaluate(() => window.VildaVault.getCurrentUser().userId)).toBe(userId);
    expect(await page.evaluate(() => new URL(navigator.serviceWorker.controller.scriptURL).pathname)).toBe('/service-worker-kalorii.js');
    expect(await page.evaluate(prefix => fetch(prefix + Date.now()).then(() => false, () => true), probePrefix)).toBe(true);
    expect(await page.evaluate(() => typeof window.VildaLabResultPresentation?.describe === 'function'
      && typeof window.VildaLabResultChart?.render === 'function')).toBe(true);
    for (const resource of currentResources) {
      expect(served.get(resource.url), resource.url + ' delivered by production SW after closing Chromium').toBe(true);
      const actualHash = await page.evaluate(async url => {
        const response = await fetch(url);
        if (!response.ok) throw new Error('Missing offline laboratory resource: ' + url);
        const digest = await crypto.subtle.digest('SHA-256', await response.arrayBuffer());
        return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
      }, resource.url);
      expect(actualHash, resource.url + ' exact current bytes in offline cache').toBe(resource.sha256);
    }

    await otworzBadania(page, patientId);
    const lab = sekcjaBadan(page);
    await expect(lab.locator('.vilda-lab-hist-result-row')).toHaveCount(15);
    await expect(lab.locator('.vilda-lab-hist-date-group').first()).toHaveAttribute('data-date-iso', '2026-06-02');
    await expect(result(lab, ids.tsh4).locator('.vilda-lab-hist-cell-value')).toHaveCSS('color', 'rgb(207, 34, 46)');
    await expect(result(lab, ids.tsh4).locator('.vilda-lab-hist-result-norm')).toHaveText(/0,27.*4,2.*mIU\/L/);
    await expect(result(lab, ids.ft44).locator('.vilda-lab-hist-cell-value')).toHaveCSS('color', 'rgb(8, 127, 91)');
    await expect(result(lab, ids.ft3).locator('.vilda-lab-hist-result-norm')).toHaveText('—');
    await expect(result(lab, ids.lh1)).toContainText('<0,1');
    await expect(lab).not.toContainText('Zapisane oceny');
    await lab.getByRole('button', { name: 'Wykresy', exact: true }).click();
    const tsh = lab.locator('.vilda-lab-hist-card[data-series="tsh"]');
    await expect(tsh.locator('.vilda-lab-hist-result-norm')).toHaveText(/0,27.*4,2.*mIU\/L/);
    await expect(tsh.locator('.vilda-lab-result-chart-band')).not.toHaveCount(0);
    await expect(lab.locator(`.vilda-lab-result-chart-point[data-note-id="${ids.lh1}"]`)).toHaveCount(0);
    // Pointer interaction must still distinguish exact coincident records;
    // neither a fake x-offset nor a later invisible button hides the first one.
    for (const id of [ids.tsh4, duplicate]) {
      await tsh.locator('.vilda-lab-result-chart-point[data-count="2"]').click();
      await tsh.locator(`.vilda-lab-result-chart-choice[data-note-id="${id}"]`).click();
      await expect(lab.locator('.vilda-lab-hist-result-details')).toHaveAttribute('data-note-id', id);
      await lab.getByRole('button', { name: 'Zamknij szczegóły wyniku', exact: true }).click();
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    expect(await notes(page, patientId)).toEqual(before);
    await tsh.screenshot({ path: testInfo.outputPath('lab-results-cold-offline-tsh-390.png') });
    expect(failed).toEqual([]);
    expect(errors).toEqual([]);
    await testInfo.attach('lab-results-production-offline-evidence', { contentType: 'application/json', body: Buffer.from(JSON.stringify({
      version, workerSHA256: hash(workerBytes), resources: currentResources,
      noteCount: before.length, tableAndCharts: true, coincidentRecordsSelectable: true,
    }, null, 2)) });
  } finally {
    if (context) await context.close();
    await server.stop();
    fs.rmSync(profile, { recursive: true, force: true });
  }
});
