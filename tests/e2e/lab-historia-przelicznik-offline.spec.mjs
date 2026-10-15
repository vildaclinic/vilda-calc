import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';

// LAB-HISTORIA PR3: pasek „Poprzednie wyniki” działa offline po instalacji produkcyjnego SW (AGENTS.md § 6).
// Pełny precache, osobny profil, zatrzymany serwer i zimny restart przeglądarki; sejf, pacjentka i wyniki
// powstają dopiero offline (dane wyłącznie fikcyjne). Wzór: lab-amh-xu-offline.spec.mjs.
test.use({ serviceWorkers: 'allow' });
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const converter = fs.readFileSync(path.join(root, 'przelicznik-jednostek.html'), 'utf8');
const resources = ['vilda_lab_history.js', 'lab_history_strip.js', 'lab_history_strip.css'].map((name) => ({
  url: '/' + [...converter.matchAll(/(?:src|href)="([^"]+)"/g)].map((match) => match[1]).find((url) => url.split('?')[0] === name),
  sha256: createHash('sha256').update(fs.readFileSync(path.join(root, name))).digest('hex'),
}));

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
    child.once('exit', (code) => reject(new Error(`Static server exited before startup: ${code}`)));
  });
  return { origin, stop: () => new Promise((resolve) => {
    if (child.exitCode !== null || child.signalCode !== null) { resolve(); return; }
    child.once('exit', resolve);
    child.kill('SIGKILL');
  }) };
}

test('pasek poprzednich wyników po zimnym starcie offline: zasoby z SW, sejf i wykres bez sieci', async ({ playwright, browserName, launchOptions }) => {
  test.setTimeout(180_000);
  for (const resource of resources) expect(resource.url, 'zasób ładowany przez przelicznik').toMatch(/\?v=\d+$/);
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'vilda-lab-strip-offline-'));
  const server = await startServer();
  const launch = () => playwright[browserName].launchPersistentContext(profile, {
    ...launchOptions, serviceWorkers: 'allow', locale: 'pl-PL', viewport: { width: 1280, height: 1000 },
  });
  let context;
  try {
    context = await launch();
    const installer = context.pages()[0] || await context.newPage();
    await installer.goto(`${server.origin}/tests/fixtures/service-worker-runner.html`);
    const state = await installer.evaluate(async () => {
      const registration = await navigator.serviceWorker.register('/service-worker-kalorii.js', { scope: '/' });
      const worker = registration.installing || registration.waiting || registration.active;
      const finished = () => ['activated', 'redundant'].includes(worker.state);
      if (!finished()) await new Promise((resolve) => { worker.addEventListener('statechange', () => { if (finished()) resolve(); }); });
      return worker.state;
    });
    expect(state, 'instalacja i aktywacja produkcyjnego SW').toBe('activated');
    await context.close();
    context = null;
    await server.stop();

    context = await launch();
    await context.addInitScript(() => {
      localStorage.setItem('vilda-terms-accepted-v1', JSON.stringify({ version: 1, acceptedAtISO: new Date().toISOString() }));
      const d = new Date();
      const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      localStorage.setItem('vilda-reminders-shown-v1', `${iso}|${Date.now()}`);
      localStorage.setItem('vilda-reminders-closed-v1', `${iso}|${Date.now()}`);
    });
    const page = context.pages()[0] || await context.newPage();
    const loaded = new Map();
    page.on('response', (response) => {
      const url = new URL(response.url());
      if (resources.some((resource) => resource.url === url.pathname + url.search)) loaded.set(url.pathname + url.search, response.fromServiceWorker());
    });
    const adres = `${server.origin}/przelicznik-jednostek.html`;
    await page.goto(adres, { waitUntil: 'load' });
    await page.waitForFunction(() => Boolean(window.VildaLabHistoryStrip && window.VildaLabHistory && window.VildaLabConverterRuntime));
    const noNetwork = () => page.evaluate(() => fetch(`/README.md?offline-probe=${Date.now()}`).then(() => false, () => true));
    expect(await noNetwork(), 'serwer zatrzymany przed zimnym startem').toBe(true);
    for (const resource of resources) {
      expect(loaded.get(resource.url), `${resource.url} z produkcyjnego SW`).toBe(true);
      const sha256 = await page.evaluate(async (url) => {
        const response = await fetch(url);
        if (!response.ok) throw new Error(`Brak zasobu w cache ${url}: ${response.status}`);
        const bytes = await crypto.subtle.digest('SHA-256', await response.arrayBuffer());
        return [...new Uint8Array(bytes)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
      }, resource.url);
      expect(sha256, `bajty offline = bieżące źródło: ${resource.url}`).toBe(resource.sha256);
    }

    // Fikcyjny sejf i fikcyjna pacjentka powstają offline; nic nie jest podmieniane w kodzie produkcyjnym.
    await page.evaluate(() => window.VildaSession.ensureAuthLoaded());
    await page.waitForFunction(() => Boolean(window.VildaVault));
    await page.evaluate(() => window.VildaVault.createUser('E2e#Offline!2026', { label: 'Fikcyjny sejf offline', iterations: 10000 }));
    await page.reload({ waitUntil: 'load' });
    await page.waitForFunction(() => window.VildaVault?.isUnlocked());
    const patientId = await page.evaluate(async () => {
      const V = window.VildaVault;
      const pid = (await V.savePatient({ name: 'Fikcyjna Offline', user: { name: 'Fikcyjna Offline', sex: 'F', age: 30, ageMonths: 0, height: 165, weight: 60 } }, { dedup: false })).patientId;
      for (const [date, value] of [['2026-03-02', 2.1], ['2026-05-04', 3.4]]) {
        await V.savePatientNote({ patientId: pid, title: 'Fikcyjne TSH', body: '', category: 'wynik-badania', clinicalDateISO: date,
          labResult: { test: 'TSH (tyreotropina)', testKey: 'tsh', value: String(value).replace('.', ','), valueNum: value, unit: 'mIU/L' } });
      }
      sessionStorage.setItem('vildaCurrentPatientId', pid);
      window.VildaPersistence.writeShared({ name: 'Fikcyjna Offline', sex: 'F', age: 30, ageMonths: 0 }, { force: true });
      document.dispatchEvent(new CustomEvent('vilda:patient-loaded', { detail: { patientId: pid } }));
      return pid;
    });
    expect(patientId).toBeTruthy();
    await page.locator('#labSubstance').fill('TSH');
    await page.locator('#labSubstanceDropdown .lab-substance-option[data-id="tsh"]').click();
    await page.locator('#labUnit').selectOption('mIU/L');
    await page.locator('#labValue').fill('1,9');
    const pasek = page.locator('#labHistoryStrip');
    await expect(pasek).toHaveClass(/is-on/);
    await expect(pasek.locator('.lab-strip-sub')).toContainText('Fikcyjna Offline · 2 wyniki');
    await expect(pasek.locator('svg.lab-strip-svg g.lab-strip-pt')).toHaveCount(2);
    await expect(pasek.locator('.lab-strip-diff')).toContainText('różnica −1,5 mIU/L');
    expect(await noNetwork(), 'źródło nadal niedostępne po renderze').toBe(true);
  } finally {
    if (context) await context.close();
    await server.stop();
    fs.rmSync(profile, { recursive: true, force: true });
  }
});
