import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { devices, expect, test } from '@playwright/test';
import { createFictionalVault, readyForPatient, shellFrame } from '../support/centile-live-fixture.mjs';
import { emulatePhone } from '../support/telefon-poziomo.mjs';

test.use({ serviceWorkers: 'allow' });

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const sharedResourceNames = ['vilda_phone_landscape.js', 'vilda_phone_landscape.css', 'vilda_chrome.js', 'vilda_chrome.css'];

function resourcesFor(documentName) {
  const resourceNames = documentName === 'app.html'
    ? [...sharedResourceNames, 'vilda_shell.js', 'vilda_shell.css'] : sharedResourceNames;
  const html = fs.readFileSync(path.join(root, documentName), 'utf8');
  const urls = [...html.matchAll(/<(?:script|link)\b[^>]*\b(?:src|href)="([^"]+)"[^>]*>/g)]
    .map((match) => match[1]).filter((url) => resourceNames.includes(url.split('?')[0]));
  expect(urls.map((url) => url.split('?')[0]).sort(), `${documentName}: all changed layout/menu assets are loaded`)
    .toEqual([...resourceNames].sort());
  return urls.map((url) => ({
    url: '/' + url,
    sha256: createHash('sha256').update(fs.readFileSync(path.join(root, url.split('?')[0]))).digest('hex'),
  }));
}

async function startServer() {
  const child = spawn(process.execPath, [path.join(root, 'tests/support/static-server.mjs')], {
    env: { ...process.env, PORT: '0' }, stdio: ['ignore', 'pipe', 'inherit'],
  });
  const origin = await new Promise((resolve, reject) => {
    let output = '';
    child.stdout.on('data', (chunk) => {
      output += chunk;
      const match = /http:\/\/127\.0\.0\.1:(\d+)/.exec(output);
      if (match) resolve(`http://127.0.0.1:${match[1]}`);
    });
    child.once('error', reject);
    child.once('exit', (code) => reject(new Error(`Offline test server exited before startup: ${code}`)));
  });
  return { origin, stop: () => new Promise((resolve) => {
    if (child.exitCode !== null || child.signalCode !== null) { resolve(); return; }
    child.once('exit', resolve);
    child.kill('SIGKILL');
  }) };
}

async function installProductionWorker(page, origin) {
  // Only the runner is visited online. App/Start/DocPro and their feature assets
  // are populated by the unmodified production precache, never by page visits.
  await page.goto(`${origin}/tests/fixtures/service-worker-runner.html`);
  const state = await page.evaluate(async () => {
    const registration = await navigator.serviceWorker.register('/service-worker-kalorii.js', { scope: '/' });
    const worker = registration.installing || registration.waiting || registration.active;
    const done = () => ['activated', 'redundant'].includes(worker.state);
    if (!done()) await new Promise((resolve) => {
      worker.addEventListener('statechange', () => { if (done()) resolve(); });
    });
    return worker.state;
  });
  expect(state, 'the real production worker activated').toBe('activated');
}

async function assertOfflineResources(page, documentName, responses) {
  for (const resource of resourcesFor(documentName)) {
    expect(responses.get(resource.url), `${documentName}: ${resource.url} came from the production SW`).toBe(true);
    const hash = await page.evaluate(async (url) => {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`Missing cached module ${url}: ${response.status}`);
      const digest = await crypto.subtle.digest('SHA-256', await response.arrayBuffer());
      return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
    }, resource.url);
    expect(hash, `${resource.url}: offline bytes match the current implementation`).toBe(resource.sha256);
  }
}

async function assertCompactChrome(page) {
  await expect(page.locator('html')).toHaveClass(/\bvilda-phone-landscape\b/);
  await expect(page.locator('#mobileBottomDock')).toBeVisible();
  await expect.poll(() => page.locator('body > header').evaluate((element) => element.getBoundingClientRect().height)).toBe(52);
  await expect.poll(() => page.locator('#mobileBottomDock').evaluate((element) => element.getBoundingClientRect().height)).toBe(52);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), 'no horizontal overflow offline').toBe(true);
}

async function assertWideMenuOffline(page) {
  await page.locator('[data-vilda-chrome-menu-btn]').click();
  const panel = page.locator('[data-vilda-chrome-drawer] .chrome-drawer-panel');
  await expect(panel).toBeVisible();
  const geometry = await panel.evaluate(element => {
    const box = element.getBoundingClientRect();
    const sections = [...element.querySelectorAll('.chrome-drawer-section')].map(section => section.getBoundingClientRect());
    return { width: box.width, left: box.left, right: box.right, bottom: box.bottom,
      first: sections[0].x, tools: sections[1].x };
  });
  expect(geometry.width, 'approved B menu is cached, not the previous narrow drawer').toBe(620);
  expect(geometry.left).toBeGreaterThanOrEqual(70);
  expect(geometry.right).toBeLessThanOrEqual(956 - 70);
  expect(geometry.bottom).toBeLessThanOrEqual(440 - 29);
  expect(geometry.tools, 'tools occupy the second column offline').toBeGreaterThan(geometry.first);
  await page.keyboard.press('Escape');
  await expect(panel).toBeHidden();
}

// A real cold start: persistent Chromium exits, the origin is stopped, and only
// then do app/index/DocPro load. CDP emulates physical orientation and native CSS
// safe-area env(); this does not emulate Safari's virtual keyboard or device UI.
test('phone landscape assets and shell orientation survive a cold PWA restart without a server', async ({ playwright, browserName, launchOptions }) => {
  test.setTimeout(240_000);
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'vilda-phone-landscape-offline-'));
  const server = await startServer();
  const phone = devices['iPhone 15 Pro'];
  const launch = () => playwright[browserName].launchPersistentContext(profile, {
    ...launchOptions, userAgent: phone.userAgent, deviceScaleFactor: phone.deviceScaleFactor,
    isMobile: true, hasTouch: true,
    serviceWorkers: 'allow', baseURL: server.origin, locale: 'pl-PL', timezoneId: 'Europe/Warsaw',
    viewport: { width: 956, height: 440 }, reducedMotion: 'reduce',
  });
  let context;
  try {
    context = await launch();
    context.setDefaultTimeout(30_000);
    const installer = context.pages()[0] || await context.newPage();
    await test.step('install the entire production service worker', () => installProductionWorker(installer, server.origin));
    await context.close();
    context = null;
    await server.stop();

    context = await launch();
    context.setDefaultTimeout(30_000);
    const page = context.pages()[0] || await context.newPage();
    const responses = new Map();
    page.on('response', (response) => {
      const url = new URL(response.url());
      if (url.origin === server.origin) responses.set(url.pathname + url.search, response.fromServiceWorker());
    });
    await emulatePhone(page, { width: 956, height: 440 });
    const { frame: start } = await test.step('first app visit offline with an ephemeral fictional vault',
      () => createFictionalVault(page, { shell: true }));
    expect(await page.evaluate(() => fetch(`/__phone-offline-probe-${Date.now()}`).then(() => false, () => true)),
      'the origin is stopped, not merely configured as offline in Playwright').toBe(true);
    expect(responses.get('/app.html'), 'the shell document came from the production SW').toBe(true);
    await assertOfflineResources(page, 'app.html', responses);
    await assertOfflineResources(page, 'index.html', responses);
    await assertCompactChrome(page);
    await expect(start.locator('html')).toHaveClass(/\bvilda-phone-landscape\b/);
    await assertWideMenuOffline(page);

    await test.step('portrait removes the compact state from host and mounted frame; landscape restores it', async () => {
      await emulatePhone(page, { width: 440, height: 956, safeArea: { top: 62, right: 0, bottom: 34, left: 0 } });
      await expect(page.locator('html')).not.toHaveClass(/\bvilda-phone-landscape\b/);
      await expect(start.locator('html')).not.toHaveClass(/\bvilda-phone-landscape\b/);
      await emulatePhone(page, { width: 956, height: 440 });
      await assertCompactChrome(page);
      await expect(start.locator('html')).toHaveClass(/\bvilda-phone-landscape\b/);
      await assertWideMenuOffline(page);
    });

    await test.step('the first DocPro frame loads offline and receives the current host orientation', async () => {
      responses.clear();
      await page.locator('#mobileBottomDock a[href*="docpro"]').click();
      const docpro = await shellFrame(page, 'DocPro');
      await readyForPatient(docpro);
      await expect(docpro.locator('html')).toHaveClass(/\bvilda-phone-landscape\b/);
      expect(responses.get('/docpro.html?embedded=1'), 'DocPro document came from the SW on its first visit').toBe(true);
      await assertOfflineResources(page, 'docpro.html', responses);
      // The real first-visit professional dialog correctly hides shell navigation
      // until it is dismissed; its presence is independent of the offline layout.
      await expect(docpro.locator('#professionalConfirmBtn')).toBeVisible();
      await expect(page.locator('#mobileBottomDock')).toBeHidden();
      await docpro.locator('#professionalConfirmBtn').click();
      await assertCompactChrome(page);
    });

    await test.step('standalone Start also uses the cached layout module', async () => {
      responses.clear();
      await page.goto('/index.html', { waitUntil: 'load' });
      await readyForPatient(page);
      expect(responses.get('/index.html'), 'standalone document came from the SW').toBe(true);
      await assertOfflineResources(page, 'index.html', responses);
      await assertCompactChrome(page);
      await assertWideMenuOffline(page);
    });
    expect(await page.evaluate(() => new URL(navigator.serviceWorker.controller.scriptURL).pathname)).toBe('/service-worker-kalorii.js');
  } finally {
    if (context) await context.close().catch(() => {});
    await server.stop();
    fs.rmSync(profile, { recursive: true, force: true });
  }
});
