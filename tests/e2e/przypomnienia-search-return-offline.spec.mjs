import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { devices, expect, test } from '@playwright/test';
import { clinicalFingerprint, fixturePreferences } from '../support/centile-live-fixture.mjs';
import { resultFor } from '../support/global-search-fixture.mjs';
import { RETURN_TO_SEARCH, assertSearchContext, contextAtAction, openLongResult, searchReturnFixture } from '../support/search-return-browser-fixture.mjs';

test.use({ serviceWorkers: 'allow', reducedMotion: 'reduce' });
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');

// Install the unchanged production worker and its complete precache on an
// isolated origin. Neither a test worker nor a running origin supplies assets
// after the persistent browser is fully closed and restarted offline.
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
    child.once('exit', code => reject(new Error(`Search return offline server exited: ${code}`)));
  });
  return { origin, stop: () => new Promise(resolve => {
    if (child.exitCode !== null || child.signalCode !== null) { resolve(); return; }
    child.once('exit', resolve); child.kill('SIGKILL');
  }) };
}

function currentResources() {
  const sources = ['index.html', 'vilda_auth_ui.js'].map(name => fs.readFileSync(path.join(root, name), 'utf8'));
  const loaded = sources.flatMap(source => [...source.matchAll(/["']([^"'\s]+\.(?:js|css)\?v=\d+)["']/g)].map(match => match[1]));
  return ['vilda_global_search.js', 'vilda_global_search_view.js', 'vilda_auth_ui.js',
    'vilda_global_search.css', 'vilda_reminders.css', 'vilda_care_plans.js', 'vilda_care_plans.css'].map(name => {
    const url = loaded.find(value => value.split('?')[0] === name);
    if (!url) throw new Error(`Missing versioned production resource: ${name}`);
    return { url: '/' + url, sha256: sha256(fs.readFileSync(path.join(root, name))) };
  });
}

async function fingerprint(created) {
  const clinical = await clinicalFingerprint(created.frame, created.ids.a);
  const notes = await created.frame.evaluate(async patientId => {
    const rows = await window.VildaVault.listPatientNotesForPatient(patientId);
    return rows.sort((left, right) => String(left.id).localeCompare(String(right.id)));
  }, created.ids.a);
  return { clinical, notesSha256: sha256(JSON.stringify(notes)), noteCount: notes.length,
    snapshotsSha256: sha256(JSON.stringify(clinical.vaultSnapshots)) };
}

test('a cold offline mobile patient roundtrip restores the 81st Search result, filters and scroll without changing saved data', async ({ playwright, browserName, launchOptions }, testInfo) => {
  test.setTimeout(240000);
  const resources = currentResources();
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'vilda-search-return-offline-'));
  const server = await startServer();
  const phone = devices['iPhone 15 Pro'];
  const launch = offline => playwright[browserName].launchPersistentContext(profile, {
    ...launchOptions, serviceWorkers: 'allow', offline, baseURL: server.origin,
    locale: 'pl-PL', timezoneId: 'Europe/Warsaw', viewport: { width: 390, height: 852 }, reducedMotion: 'reduce',
    isMobile: true, hasTouch: true, userAgent: phone.userAgent, deviceScaleFactor: phone.deviceScaleFactor,
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
      return worker.state;
    });
    expect(installed).toBe('activated');
    // Seed only this isolated profile's fictional encrypted account before
    // closing the complete browser. The offline pass must read these same
    // persisted records rather than manufacture a replacement fixture.
    const original = await searchReturnFixture(installer);
    const userId = await original.frame.evaluate(() => window.VildaVault.getCurrentUser().userId);
    await installer.waitForTimeout(4500);
    const persisted = await fingerprint(original);
    await context.close(); context = null;
    await server.stop();

    context = await launch(true);
    const page = context.pages()[0] || await context.newPage();
    const served = new Map(), failed = [], errors = [];
    page.on('response', response => {
      const url = new URL(response.url());
      if (url.origin === server.origin) served.set(url.pathname + url.search, response.fromServiceWorker());
    });
    page.on('requestfailed', request => {
      const url = new URL(request.url());
      if (url.origin === server.origin && !url.pathname.startsWith('/__search-return-offline-probe-')) failed.push(request.url());
    });
    page.on('pageerror', error => errors.push(error.message));

    await fixturePreferences(page);
    await page.clock.setFixedTime(new Date('2026-10-29T10:00:00+01:00'));
    await page.goto('/index.html', { waitUntil: 'load' });
    await page.waitForFunction(() => Boolean(window.VildaVault && window.VildaAuthUI));
    expect(await page.evaluate(async id => (await window.VildaVault.listUsers()).some(user => user.userId === id), userId)).toBe(true);
    // This is the fixture's own known test password, entered through the real
    // login UI on its ephemeral profile; no alternate auth flow is involved.
    await page.waitForFunction(() => window.VildaAuthUI.isBootReady());
    if (!await page.evaluate(() => window.VildaVault.isUnlocked())) {
      const auth = page.locator('#vilda-auth-ui-root');
      await auth.getByRole('button', { name: /Fikcyjny sejf testu panelu siatek/ }).click();
      await auth.locator('input[type=password]').fill('E2e#SiatkaNowyPomiar!2026');
      await auth.getByRole('button', { name: 'Zaloguj się', exact: true }).click();
    }
    await page.waitForFunction(() => window.VildaVault?.isUnlocked() && window.VildaAuthUI?.isBootReady()
      && !document.documentElement.classList.contains('vilda-auth-locked'));
    expect(await page.evaluate(() => window.VildaVault.getCurrentUser().userId)).toBe(userId);
    const created = { ...original, frame: page };
    expect(await page.evaluate(() => new URL(navigator.serviceWorker.controller.scriptURL).pathname)).toBe('/service-worker-kalorii.js');
    expect(await page.evaluate(() => fetch('/__search-return-offline-probe-' + Date.now()).then(() => false, () => true))).toBe(true);
    // Finish the existing compatibility refresh before comparing read-only
    // navigation; this is the same startup guard as the presentation fixture.
    await page.waitForTimeout(4500);
    const savedBefore = await fingerprint(created);
    expect(savedBefore.notesSha256, 'the same notes survive complete offline browser restart').toBe(persisted.notesSha256);
    expect(savedBefore.snapshotsSha256, 'the same clinical snapshots survive complete offline browser restart').toBe(persisted.snapshotsSha256);
    expect(savedBefore.noteCount).toBe(persisted.noteCount);
    let { search, listScroll } = await openLongResult(page, created);
    const action = search.getByRole('button', { name: 'Otwórz w karcie pacjenta ↗', exact: true });
    const before = await contextAtAction(search, action);
    expect(before).toMatchObject({ time: 'future', status: 'open', count: 96, detail: true });
    expect(before.detailScroll, 'the actual long preview was scrolled to its patient action').toBeGreaterThan(1000);
    await action.click();
    const card = page.locator('.vilda-auth-patient-card');
    await expect(card).toBeVisible();
    await expect(card.locator(`[data-note-id="${created.longNotes[80]}"]`)).toBeVisible();
    await card.getByRole('button', { name: RETURN_TO_SEARCH, exact: true }).click();
    search = await assertSearchContext(page, before);
    await search.getByRole('button', { name: '← Wyniki wyszukiwania', exact: true }).click();
    await expect(search).not.toHaveClass(/vgs-show-detail/);
    await expect(resultFor(search, 'note', created.longNotes[80])).toBeInViewport();
    await expect.poll(() => search.locator('.vgs-list').evaluate(node => node.scrollTop)).toBeCloseTo(listScroll, 0);
    expect(await fingerprint(created)).toEqual(savedBefore);
    expect(await search.evaluate(node => node.scrollWidth <= node.clientWidth + 1)).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);

    for (const resource of resources) {
      expect(served.get(resource.url), `${resource.url} executed from the production worker after a full browser restart`).toBe(true);
      const actual = await page.evaluate(async url => {
        const response = await fetch(url);
        if (!response.ok) throw new Error(`Missing offline resource: ${url}`);
        const digest = await crypto.subtle.digest('SHA-256', await response.arrayBuffer());
        return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
      }, resource.url);
      expect(actual, `${resource.url}: offline bytes match the reviewed source`).toBe(resource.sha256);
    }
    expect(failed).toEqual([]);
    expect(errors).toEqual([]);
    const proofPath = testInfo.outputPath('search-return-cold-offline-proof.json');
    fs.mkdirSync(path.dirname(proofPath), { recursive: true });
    fs.writeFileSync(proofPath, JSON.stringify({
      worker: 'unmodified-production-service-worker-kalorii.js', workerSha256: sha256(fs.readFileSync(path.join(root, 'service-worker-kalorii.js'))),
      coldBrowserRestarts: 1, originStopped: true, fictionalVaultPersistedBeforeRestart: true, searchContext: before,
      patientNoteFingerprint: savedBefore.notesSha256, clinicalFingerprint: sha256(JSON.stringify(savedBefore.clinical)),
      snapshotsFingerprint: savedBefore.snapshotsSha256, noteCount: savedBefore.noteCount,
      resources, failedApplicationRequests: failed, pageErrors: errors,
    }, null, 2));
    await testInfo.attach('search-return-cold-offline-proof', { contentType: 'application/json', path: proofPath });
  } finally {
    if (context) await context.close().catch(() => {});
    await server.stop(); fs.rmSync(profile, { recursive: true, force: true });
  }
});
