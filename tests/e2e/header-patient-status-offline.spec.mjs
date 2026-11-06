import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { expect, test } from '@playwright/test';
import { createFictionalVault, fixturePreferences, loadPatient, readyForPatient, shellFrame } from '../support/centile-live-fixture.mjs';
import { closeChromeMenu, visibleChromeMenu } from '../support/chrome-menu-fixture.mjs';
import { GLOBAL_QUERY, SEARCH_WORKSPACE, queryGlobal, resultFor } from '../support/global-search-fixture.mjs';
import { expectBell, expectDesktopSearchControl } from '../support/header-layout-fixture.mjs';
import { RETURN_TO_SEARCH } from '../support/search-return-browser-fixture.mjs';
import { czekajNaOdtworzenieSesji } from '../support/sesja-czekanie.mjs';
import { changedResources as resourceInventory, upgradeResourceInventories } from '../support/pwa-changed-resource-inventory.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const BASE = '83fa1193';
const PASSWORD = 'E2e#SiatkaNowyPomiar!2026';
const PROBE = '/__header-status-offline-probe-';
const NOTE = 'Fikcyjna sprawa testu nagłówka offline';
// These legal pages already sit outside the production worker's document
// promise in BASE. Their version-reference edits still receive source hashes.
const NON_PRECACHE_DOCUMENTS = ['polityka-prywatnosci.html', 'regulamin.html'];
const execute = promisify(execFile);
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const workerSource = tree => fs.readFileSync(path.join(tree, 'service-worker-kalorii.js'), 'utf8');
const workerVersion = tree => /const SW_VERSION = '([^']+)';/u.exec(workerSource(tree))[1];

test.use({ serviceWorkers: 'allow', reducedMotion: 'reduce' });

function changedResources(tree, names) {
  return resourceInventory(tree, names, NON_PRECACHE_DOCUMENTS);
}

async function deployment() {
  const baseline = fs.mkdtempSync(path.join(os.tmpdir(), 'vilda-header-status-base-'));
  try {
    const archive = path.join(baseline, 'baseline.tar');
    await execute('git', ['archive', '--format=tar', '--output', archive, BASE], { cwd: ROOT });
    await execute('tar', ['-x', '-f', archive, '-C', baseline]);
    fs.rmSync(archive);
    const { stdout: changed } = await execute('git', ['diff', '--name-only', BASE, '--'], { cwd: ROOT, encoding: 'utf8' });
    const { stdout: sourceCommit } = await execute('git', ['rev-parse', 'HEAD'], { cwd: ROOT, encoding: 'utf8' });
    const names = changed
      .trim().split('\n').filter(name => !name.includes('/') && /\.(?:html|js|css)$/u.test(name)
        && name !== 'service-worker-kalorii.js');
    if (!names.includes('vilda_chrome.js') || !names.includes('vilda_chrome.css')) {
      throw new Error('Expected the reviewed header production changes relative to ' + BASE);
    }
    const previousVersion = workerVersion(baseline), currentVersion = workerVersion(ROOT);
    if (previousVersion === currentVersion) throw new Error('Run the official resource version bump before this PWA update test');
    const { stdout: added } = await execute('git', ['diff', '--name-only', '--diff-filter=A', BASE, '--'], { cwd: ROOT, encoding: 'utf8' });
    const { oldResources, newResources, introducedResources } = upgradeResourceInventories({
      baselineTree: baseline, currentTree: ROOT, names,
      addedNames: added.trim().split('\n').filter(Boolean), nonPrecacheDocuments: NON_PRECACHE_DOCUMENTS,
    });
    expect(oldResources.length + introducedResources.length).toBe(names.length);
    expect(newResources).toHaveLength(names.length);
    for (const asset of introducedResources) {
      expect(asset.existedInBaseline).toBe(false);
      expect(asset.gitAdded).toBe(true);
      expect(asset.current.precached).toBe(true);
      expect(asset.current.sha256).toBe(sha256(fs.readFileSync(path.join(ROOT, asset.name))));
    }
    const nativeClearSources = ['vilda_data_import_export.js', 'vilda_persistence_adapter.js'].map(name => {
      const previous = sha256(fs.readFileSync(path.join(baseline, name)));
      const current = sha256(fs.readFileSync(path.join(ROOT, name)));
      expect(current, name + ' retains the baseline native Clear/persistence contract').toBe(previous);
      return { name, sha256: current };
    });
    expect(oldResources.filter(item => !item.precached).map(item => item.url)).toEqual(NON_PRECACHE_DOCUMENTS.map(name => '/' + name));
    expect(newResources.filter(item => !item.precached).map(item => item.url)).toEqual(NON_PRECACHE_DOCUMENTS.map(name => '/' + name));
    let promoted = false, stopped = false;
    const types = { '.html': 'text/html', '.js': 'application/javascript', '.json': 'application/json',
      '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp', '.woff2': 'font/woff2' };
    const server = http.createServer((request, response) => {
      const pathname = decodeURIComponent(new URL(request.url, 'http://127.0.0.1').pathname);
      const tree = promoted ? ROOT : baseline;
      const file = path.resolve(tree, '.' + (pathname === '/' ? '/index.html' : pathname));
      if (!file.startsWith(tree + path.sep)) { response.writeHead(403); response.end(); return; }
      fs.stat(file, (error, stat) => {
        if (error || !stat.isFile()) { response.writeHead(404); response.end(); return; }
        response.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream',
          'Cache-Control': pathname === '/service-worker-kalorii.js' ? 'no-store' : 'no-cache',
          ...(pathname === '/service-worker-kalorii.js' ? { 'Service-Worker-Allowed': '/' } : {}) });
        fs.createReadStream(file).pipe(response);
      });
    });
    // Dedicated ephemeral origin: never share the regular e2e server or its SW.
    await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
    return {
      origin: `http://127.0.0.1:${server.address().port}`, previousVersion, currentVersion,
      sourceCommit: sourceCommit.trim(),
      names, oldResources, newResources, introducedResources, nativeClearSources,
      workerSha256: sha256(workerSource(ROOT)),
      promote() { promoted = true; },
      async stop() {
        if (stopped) return;
        stopped = true;
        await new Promise((resolve, reject) => { server.close(error => error ? reject(error) : resolve()); server.closeIdleConnections(); });
      },
      async cleanup() { await this.stop(); fs.rmSync(baseline, { recursive: true, force: true }); },
    };
  } catch (error) {
    fs.rmSync(baseline, { recursive: true, force: true });
    throw error;
  }
}

async function activate(page, updating = false) {
  return page.evaluate(async update => {
    const registration = update ? await navigator.serviceWorker.getRegistration('/')
      : await navigator.serviceWorker.register('/service-worker-kalorii.js', { scope: '/' });
    const previous = update ? registration?.active : null;
    if (!registration) throw new Error('Missing production service worker registration');
    if (update) await registration.update();
    const worker = registration.installing || registration.waiting || registration.active;
    if (!worker || worker === previous) throw new Error('Expected a new unmodified production service worker');
    const wait = states => new Promise(resolve => {
      if (states.includes(worker.state)) { resolve(); return; }
      worker.addEventListener('statechange', () => { if (states.includes(worker.state)) resolve(); });
    });
    await wait(['installed', 'activated', 'redundant']);
    if (worker.state === 'installed') worker.postMessage({ type: 'SKIP_WAITING' });
    await wait(['activated', 'redundant']);
    return worker.state;
  }, updating);
}

async function cached(page, version, expected) {
  const resources = expected.filter(item => item.precached).map(({ url, sha256 }) => ({ url, sha256 }));
  const actual = await page.evaluate(async ({ version, urls }) => {
    const cache = await caches.open('pwa-kalorii-shell-v' + version);
    return Promise.all(urls.map(async url => {
      const response = await cache.match(url);
      const bytes = response?.ok ? await crypto.subtle.digest('SHA-256', await response.arrayBuffer()) : null;
      return { url, sha256: bytes && [...new Uint8Array(bytes)].map(byte => byte.toString(16).padStart(2, '0')).join('') };
    }));
  }, { version, urls: resources.map(item => item.url) });
  expect(actual).toEqual(resources);
}

async function recordFingerprint(owner, ids) {
  return owner.evaluate(async patientIds => {
    // Entire public records, including every snapshot, clinical field and
    // timestamp; no field is removed or normalized before hashing.
    const records = await Promise.all(patientIds.map(async id => ({
      patient: await window.VildaVault.getPatient(id),
      notes: await window.VildaVault.listPatientNotesForPatient(id),
    })));
    const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(records)));
    return [...new Uint8Array(bytes)].map(byte => byte.toString(16).padStart(2, '0')).join('');
  }, ids);
}

async function clinicalView(owner) {
  return owner.evaluate(() => ({
    patientId: sessionStorage.getItem('vildaCurrentPatientId'),
    fields: Object.fromEntries(['age', 'ageMonths', 'sex', 'weight', 'height', 'bpSystolic', 'bpDiastolic']
      .map(id => [id, document.getElementById(id)?.value])),
    lines: window.getFormattedProfessionalSummaryLines(),
    rows: Array.from(document.querySelectorAll('#currentSummaryContent .professional-summary-row'), node => ({
      key: node.dataset.summaryKey, tone: node.dataset.tone, assessment: node.dataset.assessment, text: node.textContent,
    })),
  }));
}

async function settled(owner) {
  await readyForPatient(owner);
  await czekajNaOdtworzenieSesji(owner);
  await owner.waitForFunction(() => !window.__vildaPersistRestoring
    && !window.VildaDobAge?.restorePending?.()
    && !window.VildaDataImportExport?.isMainSessionRestorePending?.());
}

async function bootstrapCreatedPaneAuth(page) {
  // The shell may already have created hidden clinical panes while its own
  // login was booting. Finish their real, public auth loader before login's
  // auth-changed broadcast; an incomplete loader otherwise legitimately
  // reloads its frame and aborts an in-flight script. Never filter that abort
  // from the strict application-request collector below.
  const ready = new Set(), titles = [];
  for (;;) {
    let added = false;
    for (const element of await page.locator('#appPanes > iframe.app-pane').elementHandles()) {
      const frame = await element.contentFrame();
      if (!frame) throw new Error('A created production pane has no browsing context');
      if (ready.has(frame)) continue;
      added = true;
      await frame.waitForLoadState('load');
      await frame.waitForFunction(() => typeof window.VildaSession?.ensureAuthLoaded === 'function');
      await frame.evaluate(() => window.VildaSession.ensureAuthLoaded());
      await frame.waitForFunction(() => window.VildaVault && window.VildaAuthUI?.isBootReady());
      expect(await frame.evaluate(() => window.VildaVault.isUnlocked()), 'preloaded pane remains locked before login').toBe(false);
      titles.push(await element.getAttribute('title'));
      ready.add(frame);
    }
    // Include panes actually created during the asynchronous boot above, but
    // do not force optional speculative panes to be created for this test.
    if (!added) return titles;
  }
}

async function clearedState(owner) {
  return owner.evaluate(() => {
    const decision = window.VildaSaveStatusIndicator.getCurrentDecision();
    return {
      fields: Object.fromEntries(['name', 'age', 'ageMonths', 'weight', 'height', 'bpSystolic', 'bpDiastolic']
        .map(id => [id, document.getElementById(id)?.value])),
      patientId: sessionStorage.getItem('vildaCurrentPatientId'),
      reference: window.VildaSaveStatusIndicator.getReferenceFingerprint(),
      loaded: window.lastLoadedData ?? null,
      panelOwner: window.VildaPanelPacjent.wlasciciel(),
      panelStale: window.VildaPanelPacjent.nieaktualny(),
      decision: { ready: decision.ready, state: decision.state },
    };
  });
}

async function mainSessionModel(owner) {
  return owner.evaluate(() => {
    const session = window.VildaPersistence.readMainSession();
    return session === null ? null : Object.fromEntries(Object.entries(session).filter(([key]) => key !== 'timestampISO'));
  });
}

async function nativeEmptyMainSession(owner) {
  // Capture the whole real default model before the first patient is loaded.
  // Native Clear and persistence are byte-identical to the reviewed 83fa1193
  // baseline; only the snapshot's save timestamp is excluded from comparison.
  await owner.locator('#clearAllDataBtn').click();
  await expect.poll(() => mainSessionModel(owner)).toBeNull();
  await expect.poll(() => owner.evaluate(() => window.VildaSaveStatusIndicator.getState())).toBe('hidden');
  await owner.waitForFunction(() => !window.VildaPersistence.isAutosaveSuppressed()
    && !window.VildaDataImportExport.isMainSessionAutosavePaused()
    && !window.__vildaPersistRestoring && !window.VildaDobAge?.restorePending?.());
  // Clear's quarantine deliberately hides the live examination context from
  // the growth cache. Recalculate the real empty form after that boundary,
  // exactly as a later resize does, before capturing its full default model.
  await owner.evaluate(() => { window.calculateGrowthAdvanced(); });
  // PRO results mode is a retained view preference, so native autosave may
  // legitimately create this empty default snapshot after Clear's quarantine.
  expect(await owner.evaluate(() => window.VildaDataImportExport.saveMainSessionNow({ force: true }))).toBe(true);
  const model = await mainSessionModel(owner);
  expect(model.name).toBe('');
  expect(model.user).toEqual({ age: null, ageMonths: 0, sex: 'M', weight: null, height: null,
    waist: null, hip: null, tannerStage: null });
  return model;
}

async function expectCleared(page, owner, ids, fingerprint, emptyMainSession) {
  await expect.poll(() => clearedState(owner)).toEqual({
    fields: { name: '', age: '', ageMonths: '', weight: '', height: '', bpSystolic: '', bpDiastolic: '' },
    patientId: null, reference: null, loaded: null, panelOwner: null, panelStale: false,
    decision: { ready: true, state: 'hidden' },
  });
  const session = await mainSessionModel(owner);
  if (emptyMainSession === undefined) expect(session, 'native Clear immediately removes the main session').toBeNull();
  else if (session !== null) expect(session, 'later autosave contains exactly the native empty default model').toEqual(emptyMainSession);
  await expect(page.locator('#vildaHeaderSaveStatus')).toBeHidden();
  await expect(page.locator('#vildaHeaderSaveStatus')).toHaveAttribute('data-save-state', 'hidden');
  const menu = await visibleChromeMenu(page);
  await expect(menu.locator('[data-menu-save-status]')).toHaveAttribute('data-save-state', 'hidden');
  await expect(menu.locator('[data-menu-save-status]')).toHaveText('Brak danych');
  await closeChromeMenu(page);
  expect(await recordFingerprint(owner, ids), 'Clear preserves every stored patient and note byte').toBe(fingerprint);
}

async function clearedAtWidths(page, owner, ids, fingerprint, emptyMainSession, info, mode) {
  for (const width of [1440, 320, 390, 860]) {
    await page.setViewportSize({ width, height: 1000 });
    await owner.evaluate(() => scrollTo({ top: 0, behavior: 'instant' }));
    await expectDesktopSearchControl(page);
    await expectBell(page);
    await expectCleared(page, owner, ids, fingerprint, emptyMainSession);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth), `${width}px cleared host`).toBeLessThanOrEqual(1);
    expect(await owner.evaluate(() => document.documentElement.scrollWidth - innerWidth), `${width}px cleared patient pane`).toBeLessThanOrEqual(1);
    if (width === 1440 || width === 390) {
      const screenshot = info.outputPath(`${mode}-cold-offline-cleared-${width}.png`);
      await page.screenshot({ path: screenshot, scale: 'css' });
      await info.attach(`${mode}-cold-offline-cleared-${width}`, { path: screenshot, contentType: 'image/png' });
    }
  }
}

async function projectedState(page, owner, state) {
  await expect.poll(() => owner.evaluate(() => window.VildaSaveStatusIndicator.getState())).toBe(state);
  const expected = state === 'new_patient' ? 'new' : state;
  await expect(page.locator('#vildaHeaderSaveStatus')).toHaveAttribute('data-save-state', expected);
  const menu = await visibleChromeMenu(page);
  await expect(menu.locator('[data-menu-save-status]')).toHaveAttribute('data-save-state', expected);
  await expect(menu.locator('[data-menu-patient-change]')).toHaveCount(0);
  await closeChromeMenu(page);
}

async function headerAtWidths(page, owner, state, info, mode) {
  for (const width of [1440, 320, 390, 860]) {
    await page.setViewportSize({ width, height: 1000 });
    await owner.evaluate(() => scrollTo({ top: 0, behavior: 'instant' }));
    await expectDesktopSearchControl(page);
    await expectBell(page);
    await expect(page.locator('body > header input')).toHaveCount(0);
    const status = page.locator('#vildaHeaderSaveStatus');
    if (width < 992) {
      await expect(status).toBeVisible();
      await expect(status).toHaveAttribute('data-save-state', state);
      await expect(status).toHaveText(state === 'saved' ? 'Zapisano' : 'Niezapisane');
    } else {
      await expect(status).toBeHidden();
      const menu = await visibleChromeMenu(page);
      await expect(menu.locator('[data-menu-patient-name]')).toHaveCSS('font-size', '16px');
      await expect(menu.locator('.chrome-menu-patient-copy small')).toHaveCSS('font-size', '14px');
      await expect(menu.locator('[data-menu-save-status]')).toHaveCSS('font-size', '14px');
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth), `${width}px host`).toBeLessThanOrEqual(1);
    expect(await owner.evaluate(() => document.documentElement.scrollWidth - innerWidth), `${width}px patient pane`).toBeLessThanOrEqual(1);
    if (state === 'saved' && (width === 1440 || width === 390)) {
      const screenshot = info.outputPath(`${mode}-cold-offline-${width}.png`);
      await page.screenshot({ path: screenshot, scale: 'css' });
      await info.attach(`${mode}-cold-offline-${width}`, { path: screenshot, contentType: 'image/png' });
    }
  }
}

async function searchRoundTrip(page, noteId) {
  const trigger = page.locator('#vildaHeaderSearchBtn');
  await trigger.click();
  const workspace = page.locator(SEARCH_WORKSPACE), search = workspace.locator('.vgs');
  await expect(search).toBeVisible();
  const query = search.getByRole('searchbox', { name: GLOBAL_QUERY, exact: true });
  await expect(query).toBeFocused();
  await queryGlobal(search, NOTE);
  await resultFor(search, 'note', noteId).click();
  await search.getByRole('button', { name: 'Otwórz w karcie pacjenta ↗', exact: true }).click();
  const card = page.locator('.vilda-auth-patient-card');
  await expect(card.locator(`[data-note-id="${noteId}"]`)).toBeVisible();
  await card.getByRole('button', { name: RETURN_TO_SEARCH, exact: true }).click();
  await expect(query).toHaveValue(NOTE);
  await expect(search.locator('.vgs-title')).toHaveText(NOTE);
  await workspace.getByRole('button', { name: 'Zamknij Przypomnienia', exact: true }).click();
  await expect(trigger).toBeFocused();
}

for (const shell of [true, false]) {
  test(`${shell ? 'app shell' : 'standalone'}: real PWA upgrade keeps the patient and header after a cold offline restart`, async ({ playwright, browserName, launchOptions }, info) => {
    test.setTimeout(240_000);
    const site = await deployment();
    const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'vilda-header-status-offline-'));
    let context;
    const launch = offline => playwright[browserName].launchPersistentContext(profile, {
      ...launchOptions, viewport: { width: 1440, height: 1000 }, baseURL: site.origin,
      locale: 'pl-PL', timezoneId: 'Europe/Warsaw', serviceWorkers: 'allow', reducedMotion: 'reduce', offline,
    });
    try {
      context = await launch(false);
      const installer = await context.newPage();
      await installer.goto('/tests/fixtures/service-worker-runner.html');
      expect(await activate(installer)).toBe('activated');
      await cached(installer, site.previousVersion, site.oldResources);
      const fixture = await createFictionalVault(installer);
      const emptyMainSession = await nativeEmptyMainSession(installer);
      await loadPatient(installer, fixture.ids.a, 'restore', { clear: true });
      await settled(installer);
      await expect(installer.locator('#currentSummaryContent .professional-summary-main')).toBeVisible();
      await expect.poll(() => installer.evaluate(() => window.VildaSaveStatusIndicator.getState())).toBe('saved');
      const noteId = await installer.evaluate(async ({ patientId, title }) => (await window.VildaVault.savePatientNote({
        patientId, title, body: 'Wyłącznie fikcyjny opis organizacyjny testu PWA, bez zaleceń medycznych.', category: 'observation',
      })).id, { patientId: fixture.ids.a, title: NOTE });
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

      // A separate Chromium process must open the upgraded production cache.
      // No route interception, response substitution or mocked offline page.
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
      await page.goto(shell ? '/app.html#/start' : '/index.html', { waitUntil: 'load' });
      await page.waitForFunction(() => window.VildaVault && window.VildaAuthUI?.isBootReady());
      expect(await page.evaluate(() => window.VildaVault.isUnlocked())).toBe(false);
      const preLoginPaneAuth = shell ? await bootstrapCreatedPaneAuth(page) : [];
      const login = page.locator('#vilda-auth-ui-root');
      await login.getByRole('button', { name: /Fikcyjny sejf testu panelu siatek/ }).click();
      await login.locator('input[type=password]').fill(PASSWORD);
      await login.getByRole('button', { name: 'Zaloguj się', exact: true }).click();
      let owner = shell ? await shellFrame(page) : page;
      await settled(owner);
      expect(await owner.evaluate(() => window.VildaVault.getCurrentUser().userId)).toBe(userId);
      expect(await page.evaluate(prefix => fetch(prefix + Date.now()).then(() => false, () => true), PROBE)).toBe(true);
      await loadPatient(owner, fixture.ids.a, 'restore', { clear: true });
      await settled(owner);
      await projectedState(page, owner, 'saved');
      await expect.poll(() => clinicalView(owner)).toEqual(expected);
      expect(await recordFingerprint(owner, ids)).toBe(fingerprint);
      await headerAtWidths(page, owner, 'saved', info, shell ? 'shell' : 'standalone');
      await searchRoundTrip(page, noteId);
      await expect.poll(() => clinicalView(owner)).toEqual(expected);
      expect(await recordFingerprint(owner, ids)).toBe(fingerprint);

      if (shell) {
        await page.evaluate(() => window.VildaShell.navigate('docpro', false));
        owner = await shellFrame(page, 'DocPro');
        await settled(owner);
        await projectedState(page, owner, 'saved');
        await expect(owner.locator('#weight')).toHaveValue(expected.fields.weight);
        await expect(owner.locator('#height')).toHaveValue(expected.fields.height);
        await page.evaluate(() => window.VildaShell.navigate('start', false));
        owner = await shellFrame(page);
        await settled(owner);
        await projectedState(page, owner, 'saved');
      }
      const editedWeight = String(Number(expected.fields.weight) + 1);
      await owner.locator('#weight').fill(editedWeight);
      await owner.locator('#weight').blur();
      await projectedState(page, owner, 'dirty');
      await headerAtWidths(page, owner, 'dirty', info, shell ? 'shell' : 'standalone');
      expect(await recordFingerprint(owner, ids), 'editing does not silently persist a new snapshot').toBe(fingerprint);
      const dirty = await clinicalView(owner);
      await owner.evaluate(() => window.vildaPersistFlushNow({ force: true }));
      await page.reload({ waitUntil: 'load' });
      owner = shell ? await shellFrame(page) : page;
      await settled(owner);
      await projectedState(page, owner, 'dirty');
      await expect(owner.locator('#weight')).toHaveValue(editedWeight);
      await expect.poll(() => clinicalView(owner)).toEqual(dirty);
      expect(await recordFingerprint(owner, ids)).toBe(fingerprint);
      await loadPatient(owner, fixture.ids.a, 'restore');
      await settled(owner);
      await projectedState(page, owner, 'saved');
      await expect.poll(() => clinicalView(owner)).toEqual(expected);
      expect(await recordFingerprint(owner, ids)).toBe(fingerprint);

      // The new chrome action must execute the native clear while the working
      // patient is saved, also after a genuine upgrade and cold offline start.
      await page.setViewportSize({ width: shell ? 390 : 1440, height: 1000 });
      const menu = await visibleChromeMenu(page), clear = menu.locator('[data-menu-clear]');
      await expect(clear).toHaveText('Wyczyść');
      await expect(clear).toBeEnabled();
      await clear.click();
      await expect(owner.locator('.vug-backdrop')).toHaveCount(0);
      await expectCleared(page, owner, ids, fingerprint);
      await clearedAtWidths(page, owner, ids, fingerprint, emptyMainSession, info, shell ? 'shell' : 'standalone');
      await page.reload({ waitUntil: 'load' });
      owner = shell ? await shellFrame(page) : page;
      await settled(owner);
      await expectCleared(page, owner, ids, fingerprint, emptyMainSession);

      for (const asset of site.newResources.filter(item => item.precached)) {
        const response = await page.evaluate(async url => {
          const result = await fetch(url);
          const digest = await crypto.subtle.digest('SHA-256', await result.arrayBuffer());
          return { ok: result.ok, sha256: [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('') };
        }, asset.url);
        expect(response, asset.url + ' has the reviewed offline bytes').toEqual({ ok: true, sha256: asset.sha256 });
        expect(served.get(asset.url), asset.url + ' served by the production SW').toBe(true);
      }
      expect(errors).toEqual([]);
      expect(failures).toEqual([]);
      expect(changedResources(ROOT, site.names), 'all reviewed production sources stay unchanged during PWA validation').toEqual(site.newResources);
      expect(sha256(workerSource(ROOT)), 'the production worker stays unchanged during PWA validation').toBe(site.workerSha256);
      const { stdout: finalCommit } = await execute('git', ['rev-parse', 'HEAD'], { cwd: ROOT, encoding: 'utf8' });
      expect(finalCommit.trim(), 'the reviewed commit stays unchanged during PWA validation').toBe(site.sourceCommit);
      const proof = info.outputPath('header-patient-status-cold-offline-proof.json');
      fs.writeFileSync(proof, JSON.stringify({ base: BASE, mode: shell ? 'shell' : 'standalone',
        sourceCommit: site.sourceCommit,
        previousVersion: site.previousVersion, currentVersion: site.currentVersion,
        workerSha256: site.workerSha256, unmodifiedProductionUpgrade: true, coldBrowserRestarts: 1, originStopped: true,
        unchangedFullRecordFingerprint: fingerprint, userId, expectedClinicalView: expected,
        savedAfterRestore: true, dirtyAfterOfflineReload: true, searchPatientReturn: true,
        preLoginPaneAuth, nativeSidebarClear: true, emptyAfterOfflineReload: true,
        emptyDefaultMainSession: emptyMainSession,
        unchangedNativeClearSources: site.nativeClearSources,
        viewportWidths: [1440, 320, 390, 860], oldResources: site.oldResources, resources: site.newResources,
        introducedResources: site.introducedResources,
        productionSourceUntampered: true, nonPrecachedDocumentsUnchangedFromBaseline: NON_PRECACHE_DOCUMENTS,
        failedApplicationRequests: failures, pageErrors: errors,
      }, null, 2));
      await info.attach('header-patient-status-cold-offline-proof', { path: proof, contentType: 'application/json' });
    } finally {
      if (context) await context.close().catch(() => {});
      await site.cleanup();
      fs.rmSync(profile, { recursive: true, force: true });
    }
  });
}
