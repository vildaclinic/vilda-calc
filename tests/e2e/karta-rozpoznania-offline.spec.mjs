import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';
import { createFictionalVault, fixturePreferences, readyForPatient } from '../support/centile-live-fixture.mjs';
import { startPwaUpdateServer } from '../support/pwa-update-server.mjs';

// P-ROZPOZNANIA, rata 1: katalog ICD-10 (CeZ, 12 010 kodów, 845 kB) nie jest ładowany ze stroną — doczytuje się przy
// pierwszym otwarciu formularza rozpoznania. Ten test pilnuje, że PRAWDZIWY service worker ma wtedy wszystkie trzy
// pliki u siebie: instalacja online, zamknięcie przeglądarki i serwera, zimny start bez sieci, pierwsze w życiu
// otwarcie formularza. Bez tego lekarz bez zasięgu dostałby samo pole kodu ręcznego. Dane wyłącznie FIKCYJNE.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const PASSWORD = 'E2e#SiatkaNowyPomiar!2026';
const KATALOG = ['vilda_icd10_pl_data.js', 'vilda_icd10_search.js', 'vilda_icd10_picker.js'];
const digest = bytes => createHash('sha256').update(bytes).digest('hex');

test.use({ serviceWorkers: 'allow', reducedMotion: 'reduce' });

function zasoby() {
  const worker = fs.readFileSync(path.join(root, 'service-worker-kalorii.js'), 'utf8');
  const karta = fs.readFileSync(path.join(root, 'vilda_auth_ui.js'), 'utf8');
  return KATALOG.map(name => {
    const wersje = [...new Set([...worker.matchAll(new RegExp("'/" + name.replaceAll('.', '\\.') + "\\?v=(\\d+)'", 'g'))].map(m => m[1]))];
    if (wersje.length !== 1) throw new Error(`Oczekiwano jednej wersji ${name} w precache, jest: ${wersje.join(', ')}`);
    const url = '/' + name + '?v=' + wersje[0];
    // Karta prosi dokładnie o ten adres, który service worker ma w pamięci — inna wersja oznaczałaby brak pliku offline.
    if (!karta.includes('"' + url.slice(1) + '"')) throw new Error(`Karta nie ładuje ${url}`);
    return { url, sha256: digest(fs.readFileSync(path.join(root, name))) };
  });
}

test('katalog ICD-10 działa przy pierwszym otwarciu formularza rozpoznania po zimnym starcie bez sieci', async ({ playwright, browserName, launchOptions }) => {
  test.setTimeout(180_000);
  const oczekiwane = zasoby();
  const profil = fs.mkdtempSync(path.join(os.tmpdir(), 'vilda-rozpoznania-offline-'));
  const server = await startPwaUpdateServer();
  let serverStopped = false, context;
  const launch = offline => playwright[browserName].launchPersistentContext(profil, {
    ...launchOptions, viewport: { width: 1280, height: 900 }, baseURL: server.origin,
    locale: 'pl-PL', timezoneId: 'Europe/Warsaw', serviceWorkers: 'allow', offline, reducedMotion: 'reduce',
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
    // Trzy pliki katalogu są w pamięci service workera pod własnymi adresami, bajt w bajt — zanim aplikacja o nie poprosi.
    const wPamieci = await installer.evaluate(async urls => Promise.all(urls.map(async url => {
      const response = await caches.match(url);
      if (!response?.ok) return { url, sha256: null };
      const bytes = await crypto.subtle.digest('SHA-256', await response.arrayBuffer());
      return { url, sha256: [...new Uint8Array(bytes)].map(byte => byte.toString(16).padStart(2, '0')).join('') };
    })), oczekiwane.map(z => z.url));
    expect(wPamieci).toEqual(oczekiwane);

    const fixture = await createFictionalVault(installer);
    const pid = fixture.ids.a;
    // Online formularza nie otwieramy ani razu: katalog nie trafia do pamięci przeglądarki inną drogą niż instalacja.
    expect(await installer.evaluate(() => Boolean(window.VildaICD10PLData || window.VildaICD10Search || window.VildaICD10Picker))).toBe(false);
    await installer.evaluate(() => window.VildaVault.lock('manual'));
    await installer.waitForFunction(() => window.VildaVault && !window.VildaVault.isUnlocked());
    await context.close(); context = null;
    await server.close(); serverStopped = true;
    expect(await fetch(server.origin + '/index.html', { signal: AbortSignal.timeout(3000) })
      .then(() => false, () => true)).toBe(true);

    context = await launch(true);
    const page = context.pages()[0] || await context.newPage();
    const zWorkera = new Map(), bledy = [];
    page.on('response', response => {
      const url = new URL(response.url());
      if (url.origin === server.origin) zWorkera.set(url.pathname + url.search, response.fromServiceWorker());
    });
    page.on('pageerror', error => bledy.push(error.message));
    await fixturePreferences(page);
    await page.goto('/index.html', { waitUntil: 'load' });
    await page.waitForFunction(() => window.VildaVault && window.VildaAuthUI?.isBootReady());
    const auth = page.locator('#vilda-auth-ui-root');
    await auth.getByRole('button', { name: /Fikcyjny sejf testu panelu siatek/ }).click();
    await auth.locator('input[type=password]').fill(PASSWORD);
    await auth.getByRole('button', { name: 'Zaloguj się', exact: true }).click();
    await readyForPatient(page);
    expect(await page.evaluate(() => fetch('/__rozpoznania-offline-' + Date.now()).then(() => false, () => true))).toBe(true);

    await page.evaluate(id => window.VildaAuthUI.showPatientCard(id, null, null, { activeTab: 'leczenie' }), pid);
    const sekcja = page.locator('.vilda-patient-tab-content[data-tab="leczenie"] .vilda-kr');
    await expect(sekcja.locator('.vilda-kr-pusto')).toHaveText('Rozpoznania nie uzupełniono.');
    await sekcja.getByRole('button', { name: 'Dodaj rozpoznanie' }).click();
    const arkusz = page.locator('.vilda-kr-arkusz');
    await expect(arkusz.locator('.vpt-icd10-query')).toBeVisible({ timeout: 15000 });
    await expect(arkusz.locator('.vilda-kr-kod')).not.toContainText('Katalog ICD-10 jest teraz niedostępny');
    for (const zasob of oczekiwane) expect(zWorkera.get(zasob.url), zasob.url + ' z pamięci service workera').toBe(true);

    await arkusz.locator('.vpt-icd10-query').fill('niedobór hormonu wzrostu');
    await expect(arkusz.locator('.vpt-icd10-option').first()).toBeVisible();
    await arkusz.locator('.vpt-icd10-query').fill('E23.0');
    await expect(arkusz.locator('.vpt-icd10-option').first()).toContainText('E23.0 — Niedoczynność przysadki');
    await arkusz.locator('.vpt-icd10-option').first().click();
    await arkusz.getByRole('button', { name: 'Zapisz' }).click();
    await expect(arkusz).toHaveCount(0);
    await expect(sekcja.locator('.vilda-kr-wiersz strong')).toHaveText('E23.0 — Niedoczynność przysadki');
    const zapisane = await page.evaluate(async id => (await window.VildaVault.listPatientNotesForPatient(id))
      .filter(n => n.treatmentContext).map(n => n.treatmentContext), pid);
    expect(zapisane).toEqual([{ schemaVersion: 1, kind: 'diagnosis', name: 'Niedoczynność przysadki', code: 'E23.0',
      codingSystem: 'ICD-10', status: 'active', dateISO: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/) }]);
    expect(bledy).toEqual([]);
  } finally {
    if (context) await context.close();
    if (!serverStopped) await server.close();
    fs.rmSync(profil, { recursive: true, force: true });
  }
});
