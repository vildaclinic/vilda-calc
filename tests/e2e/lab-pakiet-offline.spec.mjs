import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';
import { kliknij, zaznacz } from '../support/uklad-czekanie.mjs';

// LAB-PAKIETY PR1: pakiet badań działa offline po instalacji produkcyjnego SW (AGENTS.md § 6).
// Pełny precache, osobny profil, zatrzymany serwer i zimny restart przeglądarki; sejf, pacjentka i wyniki
// powstają dopiero offline (dane wyłącznie fikcyjne). Wzór: lab-historia-przelicznik-offline.spec.mjs.
test.use({ serviceWorkers: 'allow' });
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const converter = fs.readFileSync(path.join(root, 'przelicznik-jednostek.html'), 'utf8');
const resources = ['vilda_lab_packages.js', 'inline_przelicznik_jednostek_00.css', 'vilda_persistence_adapter.js'].map((name) => ({
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

test('pakiet „Tarczyca” po zimnym starcie offline: zasoby z SW, ocena i zapis do sejfu bez sieci', async ({ playwright, browserName, launchOptions }) => {
  test.setTimeout(180_000);
  for (const resource of resources) expect(resource.url, 'zasób ładowany przez przelicznik').toMatch(/\?v=\d+$/);
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'vilda-lab-pakiet-offline-'));
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
    await page.goto(`${server.origin}/przelicznik-jednostek.html?pakiet=tarczyca`, { waitUntil: 'load' });
    await page.waitForFunction(() => Boolean(window.VildaLabPackagesUI && window.VildaLabPackages && window.VildaLabConverterRuntime));
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
    // Adres z pakietem otwiera tryb pakietu; bez logowania tylko bramka, bez pól.
    await expect(page.locator('#labModePackage')).toHaveAttribute('aria-selected', 'true');
    await expect(page.locator('#labPackageCard .lab-pkg-gate-title')).toHaveText('Pakiety badań są dostępne po zalogowaniu');
    await expect(page.locator('#labPackageCard input')).toHaveCount(0);

    // Fikcyjny sejf i fikcyjna pacjentka powstają offline; nic nie jest podmieniane w kodzie produkcyjnym.
    await page.evaluate(() => window.VildaSession.ensureAuthLoaded());
    await page.waitForFunction(() => Boolean(window.VildaVault));
    await page.evaluate(() => window.VildaVault.createUser('E2e#Offline!2026', { label: 'Fikcyjny sejf offline', iterations: 10000 }));
    await page.reload({ waitUntil: 'load' });
    await page.waitForFunction(() => window.VildaVault?.isUnlocked());
    const patientId = await page.evaluate(async () => {
      const V = window.VildaVault;
      const pid = (await V.savePatient({ name: 'Fikcyjna Offline', user: { name: 'Fikcyjna Offline', sex: 'F', age: 30, ageMonths: 0, height: 165, weight: 60 } }, { dedup: false })).patientId;
      sessionStorage.setItem('vildaCurrentPatientId', pid);
      window.VildaPersistence.writeShared({ name: 'Fikcyjna Offline', sex: 'F', age: 30, ageMonths: 0 }, { force: true });
      document.dispatchEvent(new CustomEvent('vilda:patient-loaded', { detail: { patientId: pid } }));
      return pid;
    });
    expect(patientId).toBeTruthy();
    await expect(page.locator('#labPkgValue-tsh')).toBeVisible();
    await page.locator('#labPkgValue-tsh').fill('5,1');
    await page.locator('#labPkgUnit-ft4').selectOption('ng/dL');
    await page.locator('#labPkgValue-ft4').fill('1,2');
    const karta = page.locator('#labPackageCard');
    await expect(karta.locator('.lab-pkg-card[data-analyte="tsh"] .lab-range-status')).toHaveText('powyżej normy');
    await expect(karta.locator('.lab-pkg-card[data-analyte="ft4"] .lab-range-status')).toHaveText('w zakresie normy');
    await expect(karta.locator('.lab-pkg-card[data-analyte="tsh"] .lab-pkg-card-norm')).toContainText('Dorośli');
    await kliknij(page.locator('#labPkgSave'));
    await expect(page.locator('#labPkgDone')).toContainText('Zapisano 2 wyniki w karcie pacjenta');
    const saved = await page.evaluate(async (pid) => (await window.VildaVault.listPatientNotesForPatient(pid))
      .filter((note) => note.category === 'wynik-badania')
      .map((note) => [note.labResult.testKey, note.labResult.valueNum, note.labResult.unit, note.labResult.range.classification]).sort(), patientId);
    expect(saved).toEqual([['ft4', 1.2, 'ng/dL', 'within'], ['tsh', 5.1, 'mIU/L', 'above']]);
    // Zapamiętane jednostki przetrwają ponowne otwarcie strony offline.
    await page.reload({ waitUntil: 'load' });
    await page.waitForFunction(() => window.VildaVault?.isUnlocked());
    await expect(page.locator('#labPkgUnit-ft4')).toHaveValue('ng/dL');
    // LAB-PAKIETY PR2 offline: norma z wydruku ocenia wynik, zapisuje się z nim i wraca jako podpowiedź z sejfu.
    await expect(page.locator('#labPkgNormLow-tsh')).toHaveValue('');
    await expect(page.locator('#labPkgPrefillHint')).toBeHidden();
    await page.locator('#labPkgValue-tsh').fill('4,5');
    await page.locator('#labPkgNormLow-tsh').fill('0,27');
    await page.locator('#labPkgNormHigh-tsh').fill('4,2');
    await expect(karta.locator('.lab-pkg-card[data-analyte="tsh"] .lab-range-status')).toHaveText('powyżej normy z wydruku');
    await kliknij(page.locator('#labPkgSave'));
    await expect(page.locator('#labPkgDone')).toContainText('Zapisano 1 wynik w karcie pacjenta');
    const withNorm = await page.evaluate(async (pid) => (await window.VildaVault.listPatientNotesForPatient(pid))
      .filter((note) => note.category === 'wynik-badania' && note.labResult.norm)
      .map((note) => [note.labResult.testKey, note.labResult.valueNum, note.labResult.norm, 'range' in note.labResult]), patientId);
    expect(withNorm).toEqual([['tsh', 4.5, '0,27–4,2 mIU/L', false]]);
    await expect(page.locator('#labPkgNormLow-tsh')).toHaveValue('0,27');
    await expect(page.locator('#labPkgNormHigh-tsh')).toHaveValue('4,2');
    await expect(page.locator('#labPkgPrefillHint')).toContainText('Podpowiedź z poprzedniego wyniku pacjenta');
    // LAB-PAKIETY PR4 offline: własny pakiet powstaje bez sieci, zapisuje się na koncie (pójdzie w synchronizacji,
    // gdy wróci sieć) i jest na liście po ponownym otwarciu strony.
    await page.locator('#labPkgNew').click();
    await page.locator('#labPkgCreatorName').fill('Dojrzewanie offline');
    await page.locator('#labPkgCreatorSearch').fill('lh');
    await zaznacz(page.locator('#labPkgCreatorOpt-lh'));
    await page.locator('#labPkgCreatorSearch').fill('estradiol');
    await zaznacz(page.locator('#labPkgCreatorOpt-estradiol'));
    await kliknij(page.locator('#labPkgCreatorSave'));
    await expect(page.locator('#labPkgSelect option:checked')).toHaveText('Dojrzewanie offline');
    await expect(karta.locator('.lab-pkg-row-label')).toHaveText(['LH', 'Estradiol']);
    await page.locator('#labPkgValue-lh').fill('3');
    await expect(karta.locator('.lab-pkg-card[data-analyte="lh"] .lab-range-status')).toHaveText('bez oceny w pakiecie');
    await expect.poll(() => page.evaluate(async () => {
      const wpis = (await window.VildaVault.exportSyncPayload()).userPreferences?.labCustomPackages;
      return wpis ? JSON.parse(wpis.value).packages.map((pakiet) => [pakiet.name, pakiet.analytes]) : null;
    })).toEqual([['Dojrzewanie offline', ['lh', 'estradiol']]]);
    await page.reload({ waitUntil: 'load' });
    await page.waitForFunction(() => window.VildaVault?.isUnlocked());
    // Adres strony niesie ?pakiet=tarczyca, więc otwiera się „Tarczyca”; własny pakiet jest na liście.
    await expect(page.locator('#labPkgSelect')).toHaveValue('thyroid');
    await page.locator('#labPkgSelect').selectOption({ label: 'Dojrzewanie offline' });
    await expect(karta.locator('.lab-pkg-row-label')).toHaveText(['LH', 'Estradiol']);
    expect(await noNetwork(), 'źródło nadal niedostępne po zapisie').toBe(true);
  } finally {
    if (context) await context.close();
    await server.stop();
    fs.rmSync(profile, { recursive: true, force: true });
  }
});
