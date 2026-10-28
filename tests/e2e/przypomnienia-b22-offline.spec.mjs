import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';
import { createFictionalVault } from '../support/centile-live-fixture.mjs';

test.use({ serviceWorkers: 'allow' });
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

async function startServer() {
  const child = spawn(process.execPath, [path.join(root, 'tests/support/static-server.mjs')], {
    env: { ...process.env, PORT: '0' }, stdio: ['ignore', 'pipe', 'inherit'],
  });
  const origin = await new Promise((resolve, reject) => {
    let output = '';
    child.stdout.on('data', chunk => {
      output += chunk;
      const match = /http:\/\/127\.0\.0\.1:(\d+)/.exec(output);
      if (match) resolve(`http://127.0.0.1:${match[1]}`);
    });
    child.once('error', reject);
    child.once('exit', code => reject(Error(`Offline test server exited: ${code}`)));
  });
  return { origin, stop: () => new Promise(resolve => {
    if (child.exitCode !== null || child.signalCode !== null) { resolve(); return; }
    child.once('exit', resolve); child.kill('SIGKILL');
  }) };
}

test('B2.2 cold offline: current assets, native completion, next step and persisted patient history', async ({ playwright, browserName, launchOptions }) => {
  test.setTimeout(240000);
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'vilda-reminders-b22-offline-'));
  const server = await startServer();
  const launch = () => playwright[browserName].launchPersistentContext(profile, {
    ...launchOptions, serviceWorkers: 'allow', baseURL: server.origin,
    locale: 'pl-PL', timezoneId: 'Europe/Warsaw', viewport: { width: 1440, height: 1000 },
  });
  let context;
  try {
    context = await launch();
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
    await context.close(); context = null;
    await server.stop();
    context = await launch();
    const page = context.pages()[0] || await context.newPage();
    const served = new Map();
    page.on('response', response => {
      const url = new URL(response.url());
      if (url.origin === server.origin) served.set(url.pathname + url.search, response.fromServiceWorker());
    });
    const { ids } = await createFictionalVault(page);
    expect(await page.evaluate(() => fetch(`/__offline-probe-${Date.now()}`).then(() => false, () => true))).toBe(true);
    const id = await page.evaluate(async patientId => (await window.VildaVault.savePatientNote({
      patientId, category: 'reminder-exam', title: 'Fikcyjne MR offline B22',
      body: 'Fikcyjny pierwotny opis offline.', dueDateISO: new Date().toLocaleDateString('sv'),
    })).id, ids.a);
    await page.locator('#vildaRemindersBtn').click();
    const dialog = page.locator('dialog.vb22'); await expect(dialog).toBeVisible();
    await dialog.locator(`[data-note-id="${id}"]`).click();
    await dialog.getByRole('button', { name: 'Oznacz jako wykonane', exact: true }).click();
    await dialog.getByLabel('Co zostało zrobione? (opcjonalnie)', { exact: true }).fill('Umówiono fikcyjne MR na 02.02.2027 r.');
    await dialog.getByLabel('Dodaj kolejny krok z własnym terminem').check();
    await dialog.getByLabel('Kolejny krok', { exact: true }).fill('Fikcyjna kontrola po MR offline');
    await dialog.getByLabel('Termin kolejnego kroku', { exact: true }).fill('2027-02-02');
    await dialog.getByRole('button', { name: 'Zapisz wykonanie', exact: true }).click();
    await expect(dialog.locator('.vb22-notice')).toContainText('Zapisano w Karcie pacjenta');
    const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
    const resources = ['vilda_reminders.css?v=1', ...['vilda_auth_ui.js', 'vilda_vault.js'].map(name => {
      const match = html.match(new RegExp(`src="(${name.replaceAll('.', '\\.')}\\?v=[^"]+)"`));
      expect(match, `${name} has an actual versioned entry in index`).toBeTruthy(); return match[1];
    })];
    for (const resource of resources) {
      expect(served.get('/' + resource), `${resource} came from the production SW after a cold browser restart`).toBe(true);
      const expected = createHash('sha256').update(fs.readFileSync(path.join(root, resource.split('?')[0]))).digest('hex');
      const actual = await page.evaluate(async url => {
        const response = await fetch('/' + url); if (!response.ok) throw Error(`Missing ${url}`);
        const digest = await crypto.subtle.digest('SHA-256', await response.arrayBuffer());
        return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
      }, resource);
      expect(actual, 'offline bytes match the reviewed source').toBe(expected);
    }
    await page.reload({ waitUntil: 'load' });
    await page.waitForFunction(() => window.VildaVault?.isUnlocked());
    const stored = await page.evaluate(async ({ id, patientId }) => ({
      parent: await window.VildaVault.getPatientNote(id), notes: await window.VildaVault.listPatientNotesForPatient(patientId),
    }), { id, patientId: ids.a });
    expect(stored.parent.completedAtISO).toBeTruthy();
    expect(stored.parent.body).toContain('Fikcyjny pierwotny opis offline.');
    expect(stored.parent.body).toContain('02.02.2027');
    expect(stored.notes.find(n => n.id === stored.parent.reminderContext.nextId)).toMatchObject({
      patientId: ids.a, title: 'Fikcyjna kontrola po MR offline', completedAtISO: null,
      reminderContext: { parentId: id },
    });
    await expect(page.locator('dialog.vb22')).toHaveCount(0);
  } finally {
    if (context) await context.close().catch(() => {});
    await server.stop(); fs.rmSync(profile, { recursive: true, force: true });
  }
});
