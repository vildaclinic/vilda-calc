import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { devices, expect, test } from '@playwright/test';
import { createFictionalVault, fixturePreferences, readyForPatient } from '../support/centile-live-fixture.mjs';
import { visibleChromeMenu } from '../support/chrome-menu-fixture.mjs';
import { startPwaUpdateServer } from '../support/pwa-update-server.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const BAZA = '.vilda-patient-database';
const PICKER = '.vilda-patients-list-picker';
const LIST = 'Fikcyjna lista offline';
const PASSWORD = 'E2e#SiatkaNowyPomiar!2026';
const probe = '/__database-offline-probe-';
const digest = bytes => createHash('sha256').update(bytes).digest('hex');

test.use({ serviceWorkers: 'allow', reducedMotion: 'reduce' });

function resources() {
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const loaded = [...html.matchAll(/["']([^"'\s]+\.(?:js|css)\?v=\d+)["']/g)].map(match => match[1]);
  const result = [{ url: '/index.html', sha256: digest(Buffer.from(html)) }];
  for (const name of ['vilda_vault.js', 'vilda_auth_ui.js', 'vilda_auth_ui.css',
    'vilda_patients_list.js', 'vilda_patients_list.css', 'vilda_session_bridge.js', 'vilda_chrome.js']) {
    const versions = [...new Set(loaded.filter(value => value.split('?')[0] === name))];
    if (versions.length !== 1) throw new Error(`Expected one current URL for ${name}`);
    result.push({ url: '/' + versions[0], sha256: digest(fs.readFileSync(path.join(root, name))) });
  }
  return result;
}

async function fingerprint(page, ids) {
  return page.evaluate(async patientIds => {
    const records = await Promise.all(patientIds.map(id => window.VildaVault.getPatient(id)));
    const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(records)));
    return [...new Uint8Array(bytes)].map(byte => byte.toString(16).padStart(2, '0')).join('');
  }, ids);
}

test('Baza i Listy działają po zimnym restarcie offline, zachowując dane i pełne etykiety na telefonie', async ({ playwright, browserName, launchOptions }, testInfo) => {
  test.setTimeout(180_000);
  const expectedResources = resources();
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'vilda-database-offline-'));
  const server = await startPwaUpdateServer();
  let serverStopped = false, context;
  const launch = offline => playwright[browserName].launchPersistentContext(profile, {
    ...devices['iPhone 15 Pro'], ...launchOptions,
    viewport: { width: 390, height: 852 }, baseURL: server.origin,
    locale: 'pl-PL', timezoneId: 'Europe/Warsaw', serviceWorkers: 'allow',
    offline, reducedMotion: 'reduce',
  });
  try {
    context = await launch(false);
    const installer = context.pages()[0] || await context.newPage();
    await installer.goto('/tests/fixtures/service-worker-runner.html');
    await installer.evaluate(async () => {
      const registration = await navigator.serviceWorker.register('/service-worker-kalorii.js', { scope: '/' });
      const worker = registration.installing || registration.waiting || registration.active;
      if (!['activated', 'redundant'].includes(worker.state)) await new Promise(resolve => {
        worker.addEventListener('statechange', () => {
          if (['activated', 'redundant'].includes(worker.state)) resolve();
        });
      });
      if (worker.state !== 'activated') throw new Error('Production service worker did not activate');
    });
    // Verify installation before loading the app: later online fetches must not
    // conceal an omitted precache URL for the new database reader or styles.
    const precached = await installer.evaluate(async urls => Promise.all(urls.map(async url => {
      const response = await caches.match(url);
      if (!response?.ok) return { url, sha256: null };
      const bytes = await crypto.subtle.digest('SHA-256', await response.arrayBuffer());
      return { url, sha256: [...new Uint8Array(bytes)].map(byte => byte.toString(16).padStart(2, '0')).join('') };
    })), expectedResources.map(resource => resource.url));
    expect(precached).toEqual(expectedResources);

    const fixture = await createFictionalVault(installer);
    const ids = Object.values(fixture.ids);
    await installer.evaluate(async ({ id, name }) => {
      await window.VildaVault.savePatientList({ name, memberIds: [id] });
    }, { id: fixture.ids.a, name: LIST });
    const before = await fingerprint(installer, ids);
    await installer.evaluate(() => window.VildaVault.lock('manual'));
    await installer.waitForFunction(() => window.VildaVault && !window.VildaVault.isUnlocked());
    await context.close(); context = null;
    await server.close(); serverStopped = true;
    expect(await fetch(server.origin + '/index.html', { signal: AbortSignal.timeout(3000) })
      .then(() => false, () => true)).toBe(true);

    context = await launch(true);
    const page = context.pages()[0] || await context.newPage();
    const served = new Map(), errors = [], failed = [];
    page.on('response', response => {
      const url = new URL(response.url());
      if (url.origin === server.origin) served.set(url.pathname + url.search, response.fromServiceWorker());
    });
    page.on('pageerror', error => errors.push(error.message));
    page.on('requestfailed', request => {
      const url = new URL(request.url());
      if (url.origin === server.origin && !url.pathname.startsWith(probe)) failed.push(request.url());
    });
    await fixturePreferences(page);
    await page.goto('/index.html', { waitUntil: 'load' });
    await page.waitForFunction(() => window.VildaVault && window.VildaAuthUI?.isBootReady());
    expect(await page.evaluate(() => window.VildaVault.isUnlocked())).toBe(false);
    const auth = page.locator('#vilda-auth-ui-root');
    await auth.getByRole('button', { name: /Fikcyjny sejf testu panelu siatek/ }).click();
    await auth.locator('input[type=password]').fill(PASSWORD);
    await auth.getByRole('button', { name: 'Zaloguj się', exact: true }).click();
    await readyForPatient(page);
    expect(await page.evaluate(prefix => fetch(prefix + Date.now()).then(() => false, () => true), probe)).toBe(true);
    const menu = await visibleChromeMenu(page);
    await menu.getByRole('button', { name: 'Baza pacjentów', exact: true }).click();
    const database = page.locator(BAZA);
    await expect(database.locator('.pt-row')).toHaveCount(2);
    const patient = database.locator(`.pt-row[data-patient-id="${fixture.ids.a}"]`);
    await expect(patient).toContainText('17.06.2013');
    await expect(patient).toContainText('Mężczyzna');
    await expect(patient.locator('.pt-demographic').first()).toHaveText(/^\d+ (lat|lata|rok)$/);
    await expect(patient.locator('.pt-saved')).toBeHidden();
    await expect(page.locator('#vilda-auth-ui-root .vilda-auth-brand')).toBeHidden();
    await expect.poll(() => database.locator('.pt-list-footer').evaluate(node => {
      const rect = node.getBoundingClientRect();
      return rect.bottom <= innerHeight && node.contains(document.elementFromPoint(
        rect.left + rect.width / 2, rect.top + rect.height / 2));
    }), { message: 'the optional dock must not cover the Database footer' }).toBe(true);
    const search = database.locator('.pt-search input');
    expect(await search.evaluate(input => Number.parseFloat(getComputedStyle(input).fontSize))).toBeGreaterThanOrEqual(16);
    expect((await search.boundingBox()).height).toBeGreaterThanOrEqual(44);
    await search.fill('Beata');
    await expect(database.locator('.pt-row')).toHaveCount(1);
    await expect(database.locator('.pt-row')).toContainText('Kobieta');
    await search.fill('');
    await expect(database.locator('.pt-row')).toHaveCount(2);
    const screenshot = testInfo.outputPath('database-mobile-offline.png');
    await page.screenshot({ path: screenshot, scale: 'css' });
    await testInfo.attach('database-mobile-offline', { path: screenshot, contentType: 'image/png' });
    await database.locator('.pt-lists-trigger').click();
    const picker = page.locator(PICKER);
    await expect(picker.locator('.pl-tile', { hasText: LIST })).toBeVisible();
    await picker.locator('.pl-tile', { hasText: LIST }).click();
    await expect(picker).toHaveCount(0);
    await expect(database.locator('.pt-row')).toHaveCount(1);
    await expect(database.locator('.pt-row')).toContainText('Fikcyjny Antoni');
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
    expect(await database.evaluate(node => node.scrollWidth - node.clientWidth)).toBeLessThanOrEqual(1);
    await database.getByRole('button', { name: 'Wróć do strony głównej', exact: true }).click();
    await expect(database).toHaveCount(0);
    await expect(page.locator('html')).not.toHaveClass(/vilda-patient-database-open/);
    expect(await fingerprint(page, ids)).toBe(before);

    const executed = new Map(served);
    for (const resource of expectedResources) {
      expect(executed.get(resource.url), `${resource.url} delivered by SW on cold restart`).toBe(true);
      const hash = await page.evaluate(async url => {
        const response = await fetch(url);
        if (!response.ok) throw new Error('Missing offline asset: ' + url);
        const bytes = await crypto.subtle.digest('SHA-256', await response.arrayBuffer());
        return [...new Uint8Array(bytes)].map(byte => byte.toString(16).padStart(2, '0')).join('');
      }, resource.url);
      expect(hash, resource.url).toBe(resource.sha256);
    }
    expect(errors).toEqual([]); expect(failed).toEqual([]);
    const proof = testInfo.outputPath('database-cold-offline-proof.json');
    fs.writeFileSync(proof, JSON.stringify({
      coldBrowserRestarts: 1, originStopped: true, offlineLoginThroughUI: true,
      productionWorkerLogic: true, isolatedCacheVersion: server.cacheName(),
      unchangedPatientFingerprint: before, resources: expectedResources,
    }, null, 2));
    await testInfo.attach('database-cold-offline-proof', { contentType: 'application/json', path: proof });
  } finally {
    if (context) await context.close().catch(() => {});
    if (!serverStopped) await server.close();
    fs.rmSync(profile, { recursive: true, force: true });
  }
});
