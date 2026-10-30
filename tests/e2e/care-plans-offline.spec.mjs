import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';
import { createFictionalVault, readyForPatient } from '../support/centile-live-fixture.mjs';
import { CARE_FORM, mutatePlan, openCarePlans, readPlan, selectPlan } from '../support/care-plans-fixture.mjs';

test.use({ serviceWorkers: 'allow' });
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

async function ownServer() {
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
    child.once('exit', code => reject(Error(`Care plans offline server exited: ${code}`)));
  });
  return { origin, stop: () => new Promise(resolve => {
    if (child.exitCode !== null || child.signalCode !== null) { resolve(); return; }
    child.once('exit', resolve); child.kill('SIGKILL');
  }) };
}

test('care plans cold offline: native plan, narrative result and future step persist with the production cached assets', async ({ playwright, browserName, launchOptions }) => {
  test.setTimeout(240000);
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'vilda-care-plans-offline-'));
  const server = await ownServer();
  const launch = () => playwright[browserName].launchPersistentContext(profile, {
    ...launchOptions, serviceWorkers: 'allow', baseURL: server.origin,
    locale: 'pl-PL', timezoneId: 'Europe/Warsaw', viewport: { width: 1440, height: 1000 },
  });
  let context;
  try {
    context = await launch();
    const installer = context.pages()[0] || await context.newPage();
    await installer.goto('/tests/fixtures/service-worker-runner.html');
    expect(await installer.evaluate(async () => {
      const registration = await navigator.serviceWorker.register('/service-worker-kalorii.js', { scope: '/' });
      const worker = registration.installing || registration.waiting || registration.active;
      if (!['activated', 'redundant'].includes(worker.state)) await new Promise(resolve => {
        worker.addEventListener('statechange', () => { if (['activated', 'redundant'].includes(worker.state)) resolve(); });
      });
      return worker.state;
    })).toBe('activated');
    await context.close(); context = null;
    await server.stop();
    context = await launch();
    const page = context.pages()[0] || await context.newPage();
    const served = new Map();
    page.on('response', response => {
      const url = new URL(response.url());
      if (url.origin === server.origin) served.set(url.pathname + url.search, response.fromServiceWorker());
    });
    await page.clock.setFixedTime(new Date('2026-10-29T10:00:00+01:00'));
    const created = await createFictionalVault(page);
    expect(await page.evaluate(() => fetch(`/__care-offline-probe-${Date.now()}`).then(() => false, () => true))).toBe(true);
    const plan = await mutatePlan(page, created.ids.a, null, 'create', {
      title: 'Fikcyjny plan offline', goal: 'Fikcyjne prowadzenie opieki bez sieci.',
    });
    const step = await mutatePlan(page, created.ids.a, plan.planId, 'addStep', {
      step: { title: 'Fikcyjny oczekiwany wynik offline', kind: 'Oczekujący wynik', state: 'waiting', reminderDateISO: '2026-10-29' },
    });
    const panel = await openCarePlans(page); await selectPlan(panel, plan.planId);
    await panel.locator(`[data-step-id="${step.stepId}"]`).getByRole('button', { name: 'Wpisz wynik', exact: true }).click();
    const form = page.locator(CARE_FORM);
    await form.getByLabel('Treść wyniku', { exact: true }).fill('Fikcyjny pełny opis wyniku otrzymanego offline.');
    await form.getByLabel('Dodaję kolejny krok', { exact: true }).check();
    await form.getByLabel('Kolejny krok', { exact: true }).fill('Fikcyjna przyszła kontrola offline');
    await form.getByLabel('Przypomnij w dniu', { exact: true }).fill('2027-04-29');
    await form.getByRole('button', { name: 'Zapisz wynik', exact: true }).click();
    await expect(form).toHaveCount(0);
    for (const resource of ['vilda_care_plans.js', 'vilda_care_plans.css', 'vilda_auth_ui.js', 'vilda_vault.js']) {
      const entry = [...served].find(([url]) => url.split('?')[0] === '/' + resource);
      expect(entry, `${resource} was actually requested after the cold browser restart`).toBeTruthy();
      expect(entry[1], `${resource} came from the production service worker with the server stopped`).toBe(true);
      const expected = createHash('sha256').update(fs.readFileSync(path.join(root, resource))).digest('hex');
      const actual = await page.evaluate(async url => {
        const response = await fetch(url);
        if (!response.ok) throw Error('Missing care plans offline resource: ' + url);
        const digest = await crypto.subtle.digest('SHA-256', await response.arrayBuffer());
        return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
      }, entry[0]);
      expect(actual, `${resource} cached bytes match the current production source`).toBe(expected);
    }
    await page.reload({ waitUntil: 'load' }); await readyForPatient(page);
    const saved = await readPlan(page, plan.planId);
    expect(saved).toMatchObject({ status: 'active', needsDecision: false });
    expect(saved.steps).toHaveLength(2);
    const received = saved.steps.find(s => s.id === step.stepId), control = saved.steps.find(s => s.id !== step.stepId);
    expect(received.state).toBe('done'); expect(received.resultNoteId).toBeTruthy();
    expect(control).toMatchObject({ state: 'pending', reminderDateISO: '2027-04-29', title: 'Fikcyjna przyszła kontrola offline' });
    const result = await page.evaluate(id => window.VildaVault.getPatientNote(id), received.resultNoteId);
    expect(result.patientId).toBe(created.ids.a); expect(result.body).toContain('Fikcyjny pełny opis wyniku otrzymanego offline.');
    expect(result.clinicalDateISO).toBeNull();
    const due = await page.evaluate(async () => (await window.VildaVault.listPatientNotesDueByDate()).flatMap(group => group.notes || []));
    expect(due.some(note => [received.reminderNoteId, control.reminderNoteId].includes(note.id))).toBe(false);
    const notesBeforeViews = await page.evaluate(async patientId =>
      (await window.VildaVault.listPatientNotesForPatient(patientId)).sort((a, b) => a.id.localeCompare(b.id)), created.ids.a);
    expect(notesBeforeViews.some(note => note.id === result.id)).toBe(true);

    await page.evaluate(patientId => window.VildaAuthUI.showPatientCard(patientId, null, null, { activeTab: 'notes' }), created.ids.a);
    const patient = page.locator('.vilda-auth-patient-card');
    const notes = patient.locator('.vilda-patient-notes-section');
    await expect(notes).toBeVisible();
    await expect(notes.locator('[data-note-id]')).toHaveCount(0);
    await expect(notes.locator('.vilda-patient-empty-msg')).toContainText('Brak notatek dla tego pacjenta.');

    await patient.getByRole('button', { name: 'Badania', exact: true }).click();
    const lab = patient.locator('.vilda-patient-lab-section');
    const labEntry = lab.locator(`[data-note-id="${result.id}"]`);
    await expect(labEntry).toBeVisible();
    await labEntry.click();
    const editor = page.locator('.vilda-patient-note-editor-overlay');
    await expect(editor.locator('textarea').first()).toHaveValue(result.body);
    await editor.getByRole('button', { name: 'Anuluj', exact: true }).click();
    await expect(editor).toHaveCount(0);

    await page.evaluate(({ patientId, noteId }) => window.VildaAuthUI.showPatientCard(patientId, null, null, {
      activeTab: 'notes', focusNoteId: noteId,
    }), { patientId: created.ids.a, noteId: result.id });
    const preview = patient.locator(`.vcp-record[data-note-id="${result.id}"]`);
    await expect(preview).toBeVisible();
    await expect(preview.locator('.vcp-record-body')).toHaveText(result.body);
    await expect(patient.locator('.vilda-patient-care-section')).toBeVisible();
    await preview.getByRole('button', { name: '← Wróć do planu', exact: true }).click();
    await expect(preview).toHaveCount(0);
    const care = patient.locator('.vilda-patient-care-section');
    await expect(care.locator('.vcp-detail .vcp-title')).toHaveText(saved.title);
    await care.locator(`[data-step-id="${received.id}"]`).getByRole('button', { name: 'Otwórz wynik', exact: true }).click();
    await expect(preview.locator('.vcp-record-body')).toHaveText(result.body);
    expect(await page.evaluate(id => window.VildaVault.getPatientNote(id), result.id)).toEqual(result);
    expect(await page.evaluate(async patientId =>
      (await window.VildaVault.listPatientNotesForPatient(patientId)).sort((a, b) => a.id.localeCompare(b.id)), created.ids.a)).toEqual(notesBeforeViews);
    expect(await page.evaluate(() => fetch(`/__care-offline-probe-after-views-${Date.now()}`).then(() => false, () => true))).toBe(true);

    // An explicit unlink must survive a cold cached read as an independent
    // reservation. Omitting the context would let legacy repair restore it.
    const scheduled = await mutatePlan(page, created.ids.a, plan.planId, 'addStep', {
      step: { title: 'Fikcyjna rezerwacja odłączana offline', kind: 'Konsultacja', state: 'pending',
        reminderDateISO: '2026-11-01', eventDateISO: '2026-11-12', eventTime: '11:30',
        description: 'Fikcyjna treść rezerwacji zachowana po odłączeniu.' },
    });
    const scheduledStep = scheduled.plan.steps.find(item => item.id === scheduled.stepId);
    const reservationBefore = await page.evaluate(id => window.VildaVault.getPatientNote(id), scheduledStep.calendarNoteId);
    await mutatePlan(page, created.ids.a, plan.planId, 'editStep', {
      stepId: scheduledStep.id, step: { title: scheduledStep.title, state: 'pending',
        eventDateISO: null, eventTime: null, detachEvent: true },
    });
    const detached = await readPlan(page, plan.planId);
    expect(detached.steps.find(item => item.id === scheduledStep.id)).toMatchObject({
      calendarNoteId: null, eventDateISO: null, eventTime: null, reminderDateISO: '2026-11-01',
    });
    await expect(mutatePlan(page, created.ids.a, plan.planId, 'complete', {
      stepId: scheduledStep.id, dateISO: '2030-01-01', text: 'Fikcyjne przyszłe wykonanie, którego zapis musi zostać odrzucony.',
    })).rejects.toThrow();
    expect(await readPlan(page, plan.planId)).toEqual(detached);
    await page.reload({ waitUntil: 'load' }); await readyForPatient(page);
    const afterReload = await readPlan(page, plan.planId);
    expect(afterReload.steps.find(item => item.id === received.id)).toMatchObject({
      state: 'done', resultNoteId: result.id, completionSource: 'result',
    });
    expect(afterReload.steps.find(item => item.id === scheduledStep.id)).toMatchObject({
      state: 'pending', calendarNoteId: null, eventDateISO: null, eventTime: null,
    });
    const reservationAfter = await page.evaluate(id => window.VildaVault.getPatientNote(id), reservationBefore.id);
    expect(reservationAfter.careContext).toBeNull();
    for (const key of ['id', 'patientId', 'title', 'body', 'dueDateISO', 'dueTime', 'completedAtISO', 'noShowAtISO']) {
      expect(reservationAfter[key], `offline detach preserves ${key}`).toEqual(reservationBefore[key]);
    }
    expect(await page.evaluate(() => fetch(`/__care-offline-probe-after-detach-${Date.now()}`).then(() => false, () => true))).toBe(true);
  } finally {
    if (context) await context.close().catch(() => {});
    await server.stop(); fs.rmSync(profile, { recursive: true, force: true });
  }
});
