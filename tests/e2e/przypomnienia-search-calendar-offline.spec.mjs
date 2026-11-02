import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { devices, expect, test } from '@playwright/test';
import { fixturePreferences } from '../support/centile-live-fixture.mjs';
import { resultFor } from '../support/global-search-fixture.mjs';
import { RETURN_TO_SEARCH, assertSearchContext, contextAtAction, openLongResult, searchReturnFixture } from '../support/search-return-browser-fixture.mjs';

test.use({ serviceWorkers: 'allow', reducedMotion: 'reduce' });
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const offlineProbePrefix = '/__search-calendar-offline-probe-';

// A separate origin installs the unmodified production worker and complete
// precache. The origin is stopped before the persistent browser restarts.
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
    child.once('exit', code => reject(new Error(`Search calendar offline server exited: ${code}`)));
  });
  return { origin, stop: () => new Promise(resolve => {
    if (child.exitCode !== null || child.signalCode !== null) { resolve(); return; }
    child.once('exit', resolve); child.kill('SIGKILL');
  }) };
}

function currentResources() {
  const sources = ['index.html', 'terminarz.html', 'vilda_auth_ui.js', 'vilda_session_bridge.js']
    .map(name => fs.readFileSync(path.join(root, name), 'utf8'));
  const loaded = sources.flatMap(source => [...source.matchAll(/["']([^"'\s]+\.(?:js|css)\?v=\d+)["']/g)].map(match => match[1]));
  const resources = ['index.html', 'terminarz.html'].map(name => ({ url: '/' + name, sha256: sha256(fs.readFileSync(path.join(root, name))) }));
  for (const name of ['vilda_vault.js', 'vilda_auth_ui.js', 'vilda_search_navigation.js', 'vilda_terminarz.js',
    'vilda_global_search.js', 'vilda_global_search_view.js', 'vilda_global_search.css', 'vilda_reminders.css']) {
    const versions = [...new Set(loaded.filter(value => value.split('?')[0] === name))];
    if (versions.length !== 1) throw new Error(`Expected one current version of ${name}, found: ${versions.join(', ')}`);
    resources.push({ url: '/' + versions[0], sha256: sha256(fs.readFileSync(path.join(root, name))) });
  }
  return resources;
}

async function fingerprint(owner, patientId) {
  return owner.evaluate(async id => {
    const patient = await window.VildaVault.getPatient(id);
    const notes = (await window.VildaVault.listAllPatientNotes()).sort((left, right) => left.id.localeCompare(right.id));
    async function digest(value) {
      const bytes = new TextEncoder().encode(JSON.stringify(value));
      return [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map(byte => byte.toString(16).padStart(2, '0')).join('');
    }
    return { patientSha256: await digest(patient), notesSha256: await digest(notes),
      snapshotsSha256: await digest(patient.snapshots), snapshotCount: patient.snapshots.length,
      patientNoteCount: notes.filter(note => note.patientId === id).length, totalNoteCount: notes.length };
  }, patientId);
}

async function selectedCalendar(page, noteId, dateISO) {
  await page.waitForFunction(() => window.VildaVault?.isUnlocked() && window.VildaAuthUI?.isBootReady() && window.VildaTerminarz?.openEvent);
  const calendar = page.locator('#terminarzRoot');
  const target = calendar.locator(`[data-note-id="${noteId}"][aria-current="true"]`);
  await expect(target).toHaveCount(1);
  await expect(target).toBeVisible(); await expect(target).toBeInViewport();
  await expect(target).toHaveClass(/tz-event-selected/);
  await expect(calendar.locator('[data-view="day"]')).toHaveClass(/is-active/);
  const date = new Date(dateISO + 'T12:00:00');
  await expect(calendar.locator('.tz-title')).toContainText(String(date.getFullYear()));
  await expect(calendar.locator('.tz-title')).toContainText(String(date.getDate()));
  const note = await page.evaluate(id => window.VildaVault.getPatientNote(id), noteId);
  expect(note.dueDateISO.slice(0, 10)).toBe(dateISO);
  await expect(calendar.locator(`[data-tz-selected-summary="${noteId}"] strong`)).toHaveText(note.title);
  expect(await target.evaluate(node => !node.closest('.tz-vbody--ghost,.tz-tail-row,.tz-wb--tail'))).toBe(true);
  expect(await calendar.locator('.tz-daymore').evaluateAll((nodes, id) =>
    nodes.every(node => !(node.dataset.moreIds || '').split(',').includes(id)), noteId)).toBe(true);
  await expect(page.locator('.vilda-patient-note-editor-overlay, #tzNewTermOverlay, .tz-pop')).toHaveCount(0);
  return { noteId, dateISO, title: note.title, selectedVisible: true, dayView: true };
}

test('a cold production PWA opens the 81st Search event offline and restores its source by button and Browser Back without clinical writes', async ({ playwright, browserName, launchOptions }, testInfo) => {
  test.setTimeout(300000);
  const resources = currentResources();
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'vilda-search-calendar-offline-'));
  const server = await startServer(), phone = devices['iPhone 15 Pro'];
  const launch = offline => playwright[browserName].launchPersistentContext(profile, {
    ...launchOptions, args: [...(launchOptions.args || []), '--disable-features=BackForwardCache'],
    serviceWorkers: 'allow', offline, baseURL: server.origin,
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
    // All fictional notes and snapshots are persisted before the complete
    // browser closes. The offline run never recreates patients or events.
    const original = await searchReturnFixture(installer);
    const userId = await original.frame.evaluate(() => window.VildaVault.getCurrentUser().userId);
    await installer.waitForTimeout(4500);
    const persisted = await fingerprint(original.frame, original.ids.a);
    expect(persisted.patientNoteCount).toBe(104); expect(persisted.snapshotCount).toBeGreaterThan(0);
    // End only this synthetic login so the offline pass must use its real
    // password UI, rather than rely on a surviving authentication tab.
    await original.frame.evaluate(() => window.VildaVault.lock('manual'));
    await original.frame.waitForFunction(() => !window.VildaVault.isUnlocked());
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
      if (url.origin === server.origin && !url.pathname.startsWith(offlineProbePrefix)) failed.push(request.url());
    });
    page.on('pageerror', error => errors.push(error.message));
    await fixturePreferences(page);
    await page.addInitScript(() => { window.__searchCalendarOfflineDocumentId = crypto.randomUUID(); });
    await page.clock.setFixedTime(new Date('2026-10-29T10:00:00+01:00'));
    await page.goto('/index.html', { waitUntil: 'load' });
    await page.waitForFunction(() => window.VildaVault && window.VildaAuthUI?.isBootReady());
    expect(await page.evaluate(async id => (await window.VildaVault.listUsers()).some(user => user.userId === id), userId)).toBe(true);
    expect(await page.evaluate(() => window.VildaVault.isUnlocked())).toBe(false);
    const auth = page.locator('#vilda-auth-ui-root');
    await auth.getByRole('button', { name: /Fikcyjny sejf testu panelu siatek/ }).click();
    await auth.locator('input[type=password]').fill('E2e#SiatkaNowyPomiar!2026');
    await auth.getByRole('button', { name: 'Zaloguj się', exact: true }).click();
    await page.waitForFunction(() => window.VildaVault?.isUnlocked() && window.VildaAuthUI?.isBootReady()
      && !document.documentElement.classList.contains('vilda-auth-locked'));
    expect(await page.evaluate(() => window.VildaVault.getCurrentUser().userId)).toBe(userId);
    expect(await page.evaluate(() => new URL(navigator.serviceWorker.controller.scriptURL).pathname)).toBe('/service-worker-kalorii.js');
    expect(await page.evaluate(prefix => fetch(prefix + Date.now()).then(() => false, () => true), offlineProbePrefix)).toBe(true);
    await page.waitForTimeout(4500);
    expect(await fingerprint(page, original.ids.a)).toEqual(persisted);
    const created = { ...original, frame: page };
    let { search, listScroll } = await openLongResult(page, created);
    const roundtrips = [];
    for (const exit of ['button', 'browser']) {
      const sourceDocument = await page.evaluate(() => window.__searchCalendarOfflineDocumentId);
      const action = search.getByRole('button', { name: 'Otwórz w Terminarzu ↗', exact: true });
      const before = await contextAtAction(search, action);
      expect(before).toMatchObject({ time: 'future', status: 'open', count: 96, detail: true });
      expect(before.detailScroll).toBeGreaterThan(1000);
      await action.click();
      await expect(page).toHaveURL(/\/terminarz\.html(?:[?#]|$)/);
      const selected = await selectedCalendar(page, created.longNotes[80], '2027-06-01');
      const calendarDocument = await page.evaluate(() => window.__searchCalendarOfflineDocumentId);
      expect(calendarDocument).not.toBe(sourceDocument);
      expect(await fingerprint(page, original.ids.a)).toEqual(persisted);
      if (exit === 'button') await page.getByRole('button', { name: RETURN_TO_SEARCH, exact: true }).click();
      else await page.goBack();
      await expect(page).toHaveURL(/\/index\.html(?:[?#]|$)/);
      search = await assertSearchContext(page, before);
      const returnDocument = await page.evaluate(() => window.__searchCalendarOfflineDocumentId);
      expect(returnDocument).not.toBe(sourceDocument); expect(returnDocument).not.toBe(calendarDocument);
      expect(await fingerprint(page, original.ids.a)).toEqual(persisted);
      roundtrips.push({ exit, sourceDocument, calendarDocument, returnDocument, searchContext: before, selected });
    }
    await search.getByRole('button', { name: '← Wyniki wyszukiwania', exact: true }).click();
    await expect(search).not.toHaveClass(/vgs-show-detail/);
    await expect(resultFor(search, 'note', created.longNotes[80])).toBeInViewport();
    await expect.poll(() => search.locator('.vgs-list').evaluate(node => node.scrollTop)).toBeCloseTo(listScroll, 0);
    expect(await search.evaluate(node => node.scrollWidth <= node.clientWidth + 1)).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);

    const deliveredResources = [];
    for (const resource of resources) {
      expect(served.get(resource.url), `${resource.url} executed from the production worker after a complete browser restart`).toBe(true);
      const actual = await page.evaluate(async url => {
        const response = await fetch(url);
        if (!response.ok) throw new Error(`Missing offline resource: ${url}`);
        return [...new Uint8Array(await crypto.subtle.digest('SHA-256', await response.arrayBuffer()))]
          .map(byte => byte.toString(16).padStart(2, '0')).join('');
      }, resource.url);
      expect(actual, `${resource.url}: offline bytes match the reviewed source`).toBe(resource.sha256);
      deliveredResources.push({ ...resource, fromServiceWorker: true, offlineSha256: actual });
    }
    expect(failed).toEqual([]); expect(errors).toEqual([]);
    const proofPath = testInfo.outputPath('search-calendar-cold-offline-proof.json');
    fs.mkdirSync(path.dirname(proofPath), { recursive: true });
    fs.writeFileSync(proofPath, JSON.stringify({
      worker: 'unmodified-production-service-worker-kalorii.js',
      workerSha256: sha256(fs.readFileSync(path.join(root, 'service-worker-kalorii.js'))),
      coldBrowserRestarts: 1, originStopped: true, backForwardCacheDisabled: true,
      fictionalVaultPersistedBeforeRestart: true, preRestartSyntheticSessionLocked: true, offlineLoginThroughUI: true,
      readonlyFingerprint: persisted, roundtrips, resources: deliveredResources,
      failedApplicationRequests: failed, pageErrors: errors,
    }, null, 2));
    await testInfo.attach('search-calendar-cold-offline-proof', { contentType: 'application/json', path: proofPath });
  } finally {
    if (context) await context.close().catch(() => {});
    await server.stop(); fs.rmSync(profile, { recursive: true, force: true });
  }
});
