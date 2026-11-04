import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { devices, expect, test } from '@playwright/test';
import { fixturePreferences, readyForPatient } from '../support/centile-live-fixture.mjs';
import { computeSga, expectNoSgaOverflow, expectSgaValues, openSgaFixture,
  openStatusCard, saveSga, SGA_DIALOG, SGA_TILE } from '../support/karta-pacjenta-sga.mjs';

test.use({ serviceWorkers: 'allow', reducedMotion: 'reduce' });
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const probePrefix = '/__patient-sga-cold-offline-probe-';

// The real production worker installs its complete precache on a private origin.
// Neither the origin nor the browser survives into the offline half of the test.
async function startServer() {
  const child = spawn(process.execPath, [path.join(root, 'tests/support/static-server.mjs')], {
    cwd: root, env: { ...process.env, PORT: '0' }, stdio: ['ignore', 'pipe', 'inherit'],
  });
  const origin = await new Promise((resolve, reject) => {
    let output = '';
    child.stdout.on('data', chunk => {
      output += chunk;
      const match = /http:\/\/127\.0\.0\.1:(\d+)/.exec(output);
      if (match) resolve(`http://127.0.0.1:${match[1]}`);
    });
    child.once('error', reject);
    child.once('exit', code => reject(new Error(`Patient SGA offline server exited: ${code}`)));
  });
  return { origin, stop: () => new Promise(resolve => {
    if (child.exitCode !== null || child.signalCode !== null) { resolve(); return; }
    child.once('exit', resolve); child.kill('SIGKILL');
  }) };
}

function currentResources() {
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const loaded = [...html.matchAll(/["']([^"'\s]+\.(?:js|css)\?v=\d+)["']/g)].map(match => match[1]);
  const resources = [{ url: '/index.html', sha256: sha256(Buffer.from(html)) }];
  for (const name of ['vilda_birth_assessment.js', 'vilda_patient_sga_model.js',
    'vilda_patient_sga_ui.js', 'vilda_patient_sga_ui.css', 'sga_birth_module.js',
    'vilda_auth_ui.js', 'vilda_vault.js', 'vilda_session_bridge.js']) {
    const versions = [...new Set(loaded.filter(value => value.split('?')[0] === name))];
    if (versions.length !== 1) throw new Error(`Expected one production version of ${name}, found: ${versions.join(', ')}`);
    resources.push({ url: '/' + versions[0], sha256: sha256(fs.readFileSync(path.join(root, name))) });
  }
  return resources;
}

async function persistedFingerprint(page, patientId) {
  return page.evaluate(async id => {
    const patient = await window.VildaVault.getPatient(id);
    const birth = patient.snapshots[0].payload.birth;
    async function digest(value) {
      const buffer = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(value)));
      return [...new Uint8Array(buffer)].map(byte => byte.toString(16).padStart(2, '0')).join('');
    }
    return { patientSha256: await digest(patient), snapshotsSha256: await digest(patient.snapshots),
      birthSha256: await digest(birth), assessmentSha256: await digest(birth.assessment),
      computedAtISO: birth.assessment.computedAtISO, snapshotCount: patient.snapshots.length };
  }, patientId);
}

test('saved SGA tile and details work after a cold production PWA restart offline without changing the assessment', async ({ playwright, browserName, launchOptions }, testInfo) => {
  test.setTimeout(240_000);
  const resources = currentResources();
  const workerSource = fs.readFileSync(path.join(root, 'service-worker-kalorii.js'));
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'vilda-patient-sga-offline-'));
  const server = await startServer(), phone = devices['iPhone 15 Pro'];
  const launch = offline => playwright[browserName].launchPersistentContext(profile, {
    ...launchOptions, serviceWorkers: 'allow', offline, baseURL: server.origin,
    locale: 'pl-PL', timezoneId: 'Europe/Warsaw', viewport: { width: 390, height: 852 },
    isMobile: true, hasTouch: true, userAgent: phone.userAgent,
    deviceScaleFactor: phone.deviceScaleFactor, reducedMotion: 'reduce',
  });
  let context;
  try {
    context = await launch(false);
    const installer = context.pages()[0] || await context.newPage();
    await installer.goto('/tests/fixtures/service-worker-runner.html');
    const installed = await installer.evaluate(async () => {
      const registration = await navigator.serviceWorker.register('/service-worker-kalorii.js', { scope: '/' });
      const worker = registration.installing || registration.waiting || registration.active;
      if (!['activated', 'redundant'].includes(worker.state)) await new Promise(resolve => {
        worker.addEventListener('statechange', () => { if (['activated', 'redundant'].includes(worker.state)) resolve(); });
      });
      return { state: worker.state, scriptURL: worker.scriptURL };
    });
    expect(installed.state).toBe('activated');
    expect(new URL(installed.scriptURL).pathname).toBe('/service-worker-kalorii.js');
    // Check precache before visiting a clinical document: runtime fetches cannot
    // conceal an omitted entry for the newly introduced SGA presentation files.
    const precached = await installer.evaluate(async urls => Promise.all(urls.map(async url => {
      const response = await caches.match(url);
      if (!response?.ok) return { url, sha256: null };
      const digest = await crypto.subtle.digest('SHA-256', await response.arrayBuffer());
      return { url, sha256: [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('') };
    })), resources.map(resource => resource.url));
    expect(precached).toEqual(resources);

    const fixture = await openSgaFixture(installer);
    const birth = await computeSga(fixture.frame);
    const saved = await saveSga(fixture.frame, fixture.ids.a);
    expect(saved.snapshots[0].payload.birth.assessment).toEqual(birth.assessment);
    const persisted = await persistedFingerprint(fixture.frame, fixture.ids.a);
    expect(persisted.snapshotCount).toBeGreaterThan(1);
    const userId = await fixture.frame.evaluate(() => window.VildaVault.getCurrentUser().userId);
    await fixture.frame.evaluate(() => window.VildaVault.lock('manual'));
    // Standalone DocPro can return to the login document on lock. Wait for
    // that document's real vault as well, rather than read a departing global.
    await fixture.frame.waitForFunction(() => Boolean(window.VildaVault) && !window.VildaVault.isUnlocked());
    await context.close(); context = null;
    await server.stop();
    expect(await fetch(server.origin + '/index.html', { signal: AbortSignal.timeout(3000) }).then(() => false, () => true)).toBe(true);

    context = await launch(true);
    const page = context.pages()[0] || await context.newPage();
    const served = new Map(), failed = [], errors = [];
    page.on('response', response => {
      const url = new URL(response.url());
      if (url.origin === server.origin) served.set(url.pathname + url.search, response.fromServiceWorker());
    });
    page.on('requestfailed', request => {
      const url = new URL(request.url());
      if (url.origin === server.origin && !url.pathname.startsWith(probePrefix)) failed.push(request.url());
    });
    page.on('pageerror', error => errors.push(error.message));
    await fixturePreferences(page);
    await page.goto('/index.html', { waitUntil: 'load' });
    await page.waitForFunction(() => window.VildaVault && window.VildaAuthUI?.isBootReady());
    expect(await page.evaluate(() => window.VildaVault.isUnlocked())).toBe(false);
    const auth = page.locator('#vilda-auth-ui-root');
    await auth.getByRole('button', { name: /Fikcyjny sejf testu panelu siatek/ }).click();
    await auth.locator('input[type=password]').fill('E2e#SiatkaNowyPomiar!2026');
    await auth.getByRole('button', { name: 'Zaloguj się', exact: true }).click();
    await readyForPatient(page);
    expect(await page.evaluate(() => window.VildaVault.getCurrentUser().userId)).toBe(userId);
    expect(await page.evaluate(() => new URL(navigator.serviceWorker.controller.scriptURL).pathname)).toBe('/service-worker-kalorii.js');
    expect(await page.evaluate(prefix => fetch(prefix + Date.now()).then(() => false, () => true), probePrefix)).toBe(true);
    expect(await persistedFingerprint(page, fixture.ids.a)).toEqual(persisted);

    const card = await openStatusCard(page, fixture.ids.a);
    const tile = card.locator(SGA_TILE), dialog = page.locator(SGA_DIALOG);
    await expect(tile).toContainText('SGA');
    await expect(tile).toContainText('Tak');
    await tile.click();
    await expect(page.getByRole('dialog', { name: 'SGA — dane urodzeniowe' })).toBeVisible();
    await expectSgaValues(page);
    await expect(dialog.locator('time[data-sga-assessed]')).toHaveAttribute('datetime', birth.assessment.computedAtISO);
    await expectNoSgaOverflow(page, page);
    await dialog.locator('[data-sga-return]').click();
    await expect(dialog).toHaveCount(0);
    await expect(tile).toBeFocused();
    expect(await persistedFingerprint(page, fixture.ids.a)).toEqual(persisted);

    // Capture execution delivery before explicit verification fetches, so a
    // successful probe cannot stand in for a missing production loader.
    const executed = new Map(served), delivered = [];
    for (const resource of resources) {
      expect(executed.get(resource.url), `${resource.url} loaded from the production worker after a full restart`).toBe(true);
      const actual = await page.evaluate(async url => {
        const response = await fetch(url);
        if (!response.ok) throw new Error(`Missing cold offline resource: ${url}`);
        return [...new Uint8Array(await crypto.subtle.digest('SHA-256', await response.arrayBuffer()))]
          .map(byte => byte.toString(16).padStart(2, '0')).join('');
      }, resource.url);
      expect(actual, `${resource.url}: offline bytes match the reviewed source`).toBe(resource.sha256);
      delivered.push({ ...resource, precachedBeforeClinicalBoot: true, fromServiceWorker: true, offlineSha256: actual });
    }
    expect(failed).toEqual([]); expect(errors).toEqual([]);
    const proofPath = testInfo.outputPath('patient-sga-cold-offline-proof.json');
    fs.mkdirSync(path.dirname(proofPath), { recursive: true });
    fs.writeFileSync(proofPath, JSON.stringify({
      worker: 'unmodified-production-service-worker-kalorii.js', workerSha256: sha256(workerSource),
      coldBrowserRestarts: 1, originStopped: true, persistedBeforeRestart: true,
      preRestartSyntheticSessionLocked: true, offlineLoginThroughUI: true,
      readonlyFingerprint: persisted, resources: delivered, failedApplicationRequests: failed, pageErrors: errors,
    }, null, 2));
    await testInfo.attach('patient-sga-cold-offline-proof', { contentType: 'application/json', path: proofPath });
  } finally {
    if (context) await context.close().catch(() => {});
    await server.stop(); fs.rmSync(profile, { recursive: true, force: true });
  }
});
