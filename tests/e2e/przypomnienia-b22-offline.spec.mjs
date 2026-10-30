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

test('A7 cold offline: current assets, native completion, next step and persisted patient history', async ({ playwright, browserName, launchOptions }) => {
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
    const dialog = page.locator('dialog.vb22-modal'), outcome = page.locator('dialog.vb22-outcome'); await expect(dialog).toBeVisible();
    await dialog.locator(`[data-note-id="${id}"]`).click();
    await dialog.getByRole('button', { name: 'Oznacz jako wykonane', exact: true }).click();
    await outcome.getByLabel('Co zostało zrobione? (opcjonalnie)', { exact: true }).fill('Umówiono fikcyjne MR na 02.02.2027 r.');
    await outcome.locator('.vb22-next-step summary').click();
    await outcome.getByLabel('Kolejny krok', { exact: true }).fill('Fikcyjna kontrola po MR offline');
    await outcome.getByLabel('Termin kolejnego kroku', { exact: true }).fill('2027-02-02');
    await outcome.getByRole('button', { name: 'Zapisz wykonanie', exact: true }).click();
    await expect(dialog.locator('.vb22-notice')).toContainText('Zapisano w Karcie pacjenta');
    await expect(dialog.locator('[data-tab=active]')).toHaveAttribute('aria-pressed', 'true');
    await expect(dialog.locator('[data-tab=search]')).toHaveAttribute('aria-pressed', 'false');
    await expect(dialog.locator('.vb22-detail-title')).toHaveText('Fikcyjne MR offline B22');
    const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
    const auth = fs.readFileSync(path.join(root, 'vilda_auth_ui.js'), 'utf8');
    const cssEntry = auth.match(/link\.href = '(vilda_reminders\.css\?v=\d+)'/);
    expect(cssEntry, 'reminders stylesheet has an actual versioned runtime entry').toBeTruthy();
    const searchCssEntry = html.match(/href="(vilda_global_search\.css\?v=\d+)"/);
    expect(searchCssEntry, 'Search stylesheet has an actual versioned entry in index').toBeTruthy();
    const resources = [cssEntry[1], searchCssEntry[1], ...['vilda_auth_ui.js', 'vilda_vault.js', 'vilda_global_search.js', 'vilda_global_search_view.js', 'vilda_reminders_privacy.js'].map(name => {
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
      history: await window.VildaVault.listReminderHistory(),
    }), { id, patientId: ids.a });
    expect(stored.parent.completedAtISO).toBeTruthy();
    expect(stored.parent.body).toContain('Fikcyjny pierwotny opis offline.');
    expect(stored.parent.body).toContain('02.02.2027');
    expect(stored.notes.find(n => n.id === stored.parent.reminderContext.nextId)).toMatchObject({
      patientId: ids.a, title: 'Fikcyjna kontrola po MR offline', completedAtISO: null,
      reminderContext: { parentId: id },
    });
    expect(stored.history.map(note => note.id)).toEqual([id]);
    expect(stored.history[0]).toMatchObject({ patientId: ids.a, patientName: 'Fikcyjny Antoni', body: stored.parent.body });
    await expect(page.locator('dialog.vb22')).toHaveCount(0);
    await page.locator('#vildaRemindersBtn').click();
    const reopened = page.locator('dialog.vb22-modal');
    await reopened.locator('[data-tab=search]').click();
    const search = reopened.locator('.vgs');
    await search.getByRole('searchbox', { name: 'Szukaj we wszystkich pacjentach i sprawach', exact: true }).fill('Fikcyjna kontrola po MR offline');
    const future = search.locator(`[data-search-id="note:${stored.parent.reminderContext.nextId}"]`);
    await expect(future).toBeVisible(); await future.click();
    await expect(search.locator('.vb22-detail-title')).toHaveText('Fikcyjna kontrola po MR offline');
    await expect(search.locator('.vgs-detail')).toContainText('02.02.2027');
    await reopened.getByRole('button', { name: 'Ukryj treść Przypomnień', exact: true }).click();
    await expect(reopened.locator('.vilda-reminders-private-cover')).toBeVisible();
    await expect(search).toBeHidden();
    await page.reload({ waitUntil: 'load' });
    await page.waitForFunction(() => window.VildaVault?.isUnlocked());
    await page.locator('#vildaRemindersBtn').click();
    await expect(page.locator('dialog.vb22-modal .vilda-reminders-private-cover')).toBeVisible();
    await page.locator('dialog.vb22-modal').getByRole('button', { name: 'Pokaż treść Przypomnień', exact: true }).click();
    await expect(page.locator('dialog.vb22-modal .vilda-reminders-private-cover')).toBeHidden();
  } finally {
    if (context) await context.close().catch(() => {});
    await server.stop(); fs.rmSync(profile, { recursive: true, force: true });
  }
});
