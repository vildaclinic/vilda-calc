import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';
import { readyForPatient } from '../support/centile-live-fixture.mjs';
import { currentVisit, patientRecord, prepareVisit, saveVisit } from '../support/visit-identity-fixture.mjs';

test.use({ serviceWorkers: 'allow' });

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const visitResources = [
  'vilda_visit_context.js', 'vilda_visit_history_ui.js', 'vilda_visit_history_ui.css',
  'vilda_auth_ui.js', 'vilda_vault.js', 'vilda_chrome.js', 'vilda_session_bridge.js',
  'vilda_data_import_export.js', 'custom-fixes.js',
];

function exactResources() {
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const urls = [...html.matchAll(/<(?:script|link)\b[^>]*\b(?:src|href)="([^"]+)"[^>]*>/g)].map(match => match[1]);
  const selected = visitResources.map(name => {
    const url = urls.find(value => value.split('?')[0] === name);
    if (!url) throw new Error(`Brak zasobu wizyt w index.html: ${name}`);
    return { url: '/' + url, sha256: createHash('sha256').update(fs.readFileSync(path.join(root, name))).digest('hex') };
  });
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'runtime/clinical-workspace-v1/manifest.json'), 'utf8'));
  const native = manifest.files.map(entry => ({ url: '/' + entry.path, sha256: entry.sha256 }));
  const entry = manifest.files.find(file => file.path.endsWith('/client/patient-clinical-workspace-native/index.mjs'));
  if (!entry) throw new Error('Brak bieżącego wejścia natywnego runtime');
  return { resources: selected.concat(native), entry: '/' + entry.path, nativeCount: native.length };
}

async function isolatedServer() {
  const processServer = spawn(process.execPath, [path.join(root, 'tests/support/static-server.mjs')], {
    env: { ...process.env, PORT: '0' }, stdio: ['ignore', 'pipe', 'inherit'],
  });
  const origin = await new Promise((resolve, reject) => {
    let output = '';
    processServer.stdout.on('data', chunk => {
      output += chunk;
      const match = /http:\/\/127\.0\.0\.1:(\d+)/.exec(output);
      if (match) resolve(`http://127.0.0.1:${match[1]}`);
    });
    processServer.once('error', reject);
    processServer.once('exit', code => reject(new Error(`Serwer zakończył pracę przed startem: ${code}`)));
  });
  return { origin, stop: () => new Promise(resolve => {
    if (processServer.exitCode !== null || processServer.signalCode !== null) { resolve(); return; }
    processServer.once('exit', resolve);
    processServer.kill('SIGKILL');
  }) };
}

test('wizyty offline: zimny start, rzeczywisty sejf, odtworzenie ID i dynamiczna historia z dokładnymi zasobami precache', async ({ playwright, browserName, launchOptions }) => {
  test.setTimeout(240_000);
  const expected = exactResources();
  expect(expected.nativeCount).toBeGreaterThan(40);
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'vilda-visits-offline-'));
  const server = await isolatedServer();
  const launch = () => playwright[browserName].launchPersistentContext(profile, {
    ...launchOptions, serviceWorkers: 'allow', baseURL: server.origin, locale: 'pl-PL',
    timezoneId: 'Europe/Warsaw', viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce',
  });
  let context;
  try {
    context = await launch();
    context.setDefaultTimeout(30_000);
    const installer = context.pages()[0] || await context.newPage();
    // Żadna strona kliniczna nie była jeszcze otwarta. Instalujemy niezmieniony,
    // pełny produkcyjny SW, a nie wariant testowy o przyciętym precache.
    await installer.goto('/tests/fixtures/service-worker-runner.html');
    const installed = await installer.evaluate(async () => {
      const registration = await navigator.serviceWorker.register('/service-worker-kalorii.js', { scope: '/' });
      const worker = registration.installing || registration.waiting || registration.active;
      if (!['activated', 'redundant'].includes(worker.state)) await new Promise(resolve => {
        worker.addEventListener('statechange', () => {
          if (['activated', 'redundant'].includes(worker.state)) resolve();
        });
      });
      return worker.state;
    });
    expect(installed).toBe('activated');
    await context.close(); context = null;
    await server.stop();

    context = await launch();
    context.setDefaultTimeout(30_000);
    const page = context.pages()[0] || await context.newPage();
    const responses = new Map();
    page.on('response', response => {
      const url = new URL(response.url());
      if (url.origin === server.origin) responses.set(url.pathname + url.search, response.fromServiceWorker());
    });
    // Od tego miejsca serwer jest zatrzymany. Sejf jest wyłącznie fikcyjny,
    // utworzony w tymczasowym profilu i zapisany rzeczywistym adapterem IDB.
    const { frame, ids } = await prepareVisit(page);
    const noNetwork = () => page.evaluate(() => fetch(`/__visits-offline-probe-${Date.now()}`).then(() => false, () => true));
    expect(await noNetwork(), 'brak serwera, także dla żądań samego SW').toBe(true);
    const hashes = await page.evaluate(async resources => {
      const result = [];
      for (const resource of resources) {
        const response = await fetch(resource.url);
        if (!response.ok) throw new Error(`Brak zasobu offline: ${resource.url}`);
        const hash = await crypto.subtle.digest('SHA-256', await response.arrayBuffer());
        result.push({ url: resource.url, sha256: Array.from(new Uint8Array(hash), byte => byte.toString(16).padStart(2, '0')).join('') });
      }
      return result;
    }, expected.resources);
    expect(hashes).toEqual(expected.resources);
    for (const resource of expected.resources) {
      expect(responses.get(resource.url), `dokładny zasób z produkcyjnego SW: ${resource.url}`).toBe(true);
    }
    expect(await page.evaluate(async entry => {
      const native = await import(entry);
      return typeof native.createNativeWorkspaceRuntime;
    }, expected.entry)).toBe('function');

    const saved = await saveVisit(page, frame, ids.a);
    const identity = saved.payload.visit;
    await page.reload({ waitUntil: 'load' });
    await readyForPatient(page);
    await expect(page.locator('#height')).toHaveValue('159');
    await expect(page.locator('#weight')).toHaveValue('47');
    expect(await currentVisit(page)).toEqual(identity);
    expect((await patientRecord(page, ids.a)).snapshots[0].payload.visit).toEqual(identity);

    // Przelicznik otwieramy pierwszy raz dopiero bez sieci. Jego loader ma
    // samodzielnie odtworzyć moduły Karty pacjenta, kontekstu i Historii wizyt.
    await page.goto('/przelicznik-jednostek.html', { waitUntil: 'load' });
    await page.waitForFunction(() => window.VildaVault?.isUnlocked() && window.VildaAuthUI?.isBootReady()
      && window.VildaVisitContext && window.VildaVisitHistory);
    const sessionBefore = await page.evaluate(() => window.VildaPersistence.readMainSession());
    const vaultBefore = await patientRecord(page, ids.a);
    expect(sessionBefore.visit).toEqual(identity);
    await page.getByRole('button', { name: 'Karta pacjenta — Fikcyjny Antoni', exact: true }).click();
    await page.getByRole('button', { name: 'Historia wizyt', exact: true }).click();
    const dialog = page.locator('.vvisit-dialog');
    await expect(dialog).toBeVisible();
    await expect(dialog.locator('.vvisit-visit')).toHaveCount(2);
    for (let index = 0; index < 2; index++) await dialog.locator('.vvisit-visit').nth(index).click();
    await expect(dialog.locator('.vvisit-detail')).toContainText('158 cm');
    expect(await page.evaluate(() => window.VildaPersistence.readMainSession())).toEqual(sessionBefore);
    expect(await patientRecord(page, ids.a)).toEqual(vaultBefore);
    expect(await noNetwork()).toBe(true);
    expect(await page.evaluate(() => new URL(navigator.serviceWorker.controller.scriptURL).pathname)).toBe('/service-worker-kalorii.js');
  } finally {
    if (context) await context.close().catch(() => {});
    await server.stop();
    fs.rmSync(profile, { recursive: true, force: true });
  }
});
