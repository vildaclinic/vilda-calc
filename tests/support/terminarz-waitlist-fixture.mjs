import { expect } from '@playwright/test';

// Real terminarz.html, production vault and an isolated fictional IndexedDB account.
// Setup uses the same boundary as terminarz-transakcje; interactions below use
// real pointer/fill actions so an obscured or moving editor cannot pass the test.
const PASSWORD = 'Fikcyjny#Terminarz!2026x';

export async function openWaitlists(page) {
  const dialogs = [];
  page.on('dialog', async dialog => {
    dialogs.push({ type: dialog.type(), message: dialog.message() });
    await dialog.accept();
  });
  await page.route('**/*', route => {
    const url = new URL(route.request().url());
    return url.hostname === '127.0.0.1' || ['data:', 'blob:'].includes(url.protocol)
      ? route.continue() : route.abort();
  });
  await page.addInitScript(() => {
    const now = new Date();
    const day = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    localStorage.setItem('vilda-reminders-shown-v1', `${day}|${Date.now()}`);
    localStorage.setItem('vilda-reminders-closed-v1', `${day}|${Date.now()}`);
    localStorage.setItem(`vilda-recap-${day.slice(0, 7)}`, '1');
    localStorage.setItem('vilda-terminarz-view-v1', 'waitlist');
  });
  await page.goto('/terminarz.html', { waitUntil: 'load' });
  await page.waitForFunction(() => Boolean(window.VildaVault && window.VildaTerminarz));
  const userId = await page.evaluate(async password =>
    (await window.VildaVault.createUser(password, { label: 'Fikcyjne testy list', iterations: 10000 })).userId,
  PASSWORD);
  await showCalendar(page);
  await expect(page.locator('#tzWlNewList')).toBeVisible();
  return { dialogs, userId };
}

async function showCalendar(page) {
  // createUser bypasses the login UI; reproduce its normal closing notification.
  await page.addStyleTag({ content: '#vilda-auth-ui-root{display:none!important}' });
  await page.evaluate(() => document.dispatchEvent(new CustomEvent('vilda:auth-hidden')));
  await expect(page.locator('#terminarzRoot .terminarz-locked')).toHaveCount(0);
  await expect(page.locator('#terminarzRoot .tz-wl')).toBeVisible();
}

export async function reloadWaitlists(page, userId) {
  await page.reload({ waitUntil: 'load' });
  await page.waitForFunction(() => Boolean(window.VildaVault && window.VildaTerminarz));
  const restored = await page.waitForFunction(() => window.VildaVault.isUnlocked(), null, { timeout: 4000 })
    .then(() => true, () => false);
  if (!restored) {
    await page.evaluate(({ id, password }) => window.VildaVault.unlockUser(id, password), { id: userId, password: PASSWORD });
  }
  await showCalendar(page);
}

export function waitlistCard(page, label) {
  return page.locator('.tz-wl__card').filter({ has: page.locator('.tz-wl__gname', { hasText: label }) });
}

export async function createList(page, label, permanent) {
  await page.locator('#tzWlNewList').click();
  const modal = page.locator('#tzNewListOverlay');
  await expect(modal).toBeVisible();
  await modal.locator('#tzNlName').fill(label);
  await expect(modal.locator('#tzNlPermanent')).not.toBeChecked();
  await modal.locator('#tzNlPermanent').setChecked(permanent);
  await modal.getByRole('button', { name: 'Utwórz', exact: true }).click();
  await expect(modal).toHaveCount(0);
  await expect(waitlistCard(page, label)).toBeVisible();
}

export async function seedPatients(page, count = 1) {
  return page.evaluate(async length => {
    const patients = [];
    for (let index = 1; index <= length; index += 1) {
      const name = `Fikcyjny Pacjent Testowy${String(index).padStart(2, '0')}`;
      const saved = await window.VildaVault.savePatient({ name, user: { age: 9, sex: 'M' } });
      patients.push({ name, patientId: saved.patientId });
    }
    return patients;
  }, count);
}

export async function selectPatient(page, patient) {
  await page.locator('#tzWlSearch').fill(patient.name);
  await page.locator(`#tzWlList [role="option"][data-pid="${patient.patientId}"]`).click();
  await expect(page.locator('#tzWlSelName')).toContainText(patient.name);
  await expect(page.locator('#tzWlList')).toBeHidden();
  await expect(page.locator('#tzWlSearch')).toHaveValue('');
}

export async function addWaitingPatient(page, label, patient, body = '') {
  await waitlistCard(page, label).locator('[data-wl-addto]').click();
  await expect(page.locator('#tzWlOverlay')).toBeVisible();
  await selectPatient(page, patient);
  if (body) await page.locator('#tzWlNote').fill(body);
  await page.locator('#tzWlSave:visible, #tzWlSave2:visible').click();
  await expect(page.locator('#tzWlOverlay')).toHaveCount(0);
  await expect(waitlistCard(page, label).locator('.tz-wl__row')).toHaveCount(1);
  return page.evaluate(async ({ type, pid }) => {
    const notes = await window.VildaVault.listAllPatientNotes();
    return notes.find(note => note.patientId === pid && note.procedureType === type && !note.dueDateISO).id;
  }, { type: label, pid: patient.patientId });
}

export function getNote(page, id) {
  return page.evaluate(noteId => window.VildaVault.getPatientNote(noteId), id);
}

export function listMetadata(page) {
  return page.evaluate(() => window.VildaVault.getWaitlistLists());
}

async function editorRect(page) {
  return page.locator('#tzWlOverlay .tz-modal').evaluate(element => {
    const rect = element.getBoundingClientRect();
    return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
  });
}

async function expectStableEditor(page, initial) {
  const actual = await editorRect(page);
  for (const key of ['x', 'y', 'width', 'height']) {
    expect(Math.abs(actual[key] - initial[key]), `autocomplete must not change modal ${key}`).toBeLessThanOrEqual(1);
  }
}

export async function exerciseWaitlistEditor(page) {
  await openWaitlists(page);
  const patients = await seedPatients(page, 12);
  const label = 'Fikcyjna lista notatki';
  const body = 'Fikcyjna notatka testowa.\nKontakt po uzgodnieniu terminu.';
  await createList(page, label, true);
  await waitlistCard(page, label).locator('[data-wl-addto]').click();
  const overlay = page.locator('#tzWlOverlay');
  const search = overlay.locator('#tzWlSearch');
  const options = page.locator('#tzWlList');
  await expect(search).toBeVisible();
  await expect(search).toHaveValue('');
  await expect(options).toBeHidden();
  await search.click();
  await expect(options).toBeHidden();
  const initial = await editorRect(page);

  await search.fill('Testowy');
  await expect(options).toBeVisible();
  await expect(options.locator('[role="option"][data-pid]')).toHaveCount(12);
  await expectStableEditor(page, initial);
  await expect.poll(() => options.evaluate(element => {
    const rect = element.getBoundingClientRect();
    return rect.left >= -1 && rect.right <= window.innerWidth + 1 && rect.top >= -1 && rect.bottom <= window.innerHeight + 1;
  })).toBe(true);

  const chosen = patients[6];
  await search.fill(chosen.name);
  await expect(options.locator('[role="option"][data-pid]')).toHaveCount(1);
  await expect(options.locator('[role="option"][data-pid]')).toContainText(chosen.name);
  await expectStableEditor(page, initial);
  await search.fill('');
  await expect(options).toBeHidden();
  await expectStableEditor(page, initial);
  await selectPatient(page, chosen);
  await expect(overlay.locator('#tzWlNote')).toBeVisible();
  await overlay.locator('#tzWlNote').fill(body);
  await overlay.locator('#tzWlSave:visible, #tzWlSave2:visible').click();
  await expect(overlay).toHaveCount(0);

  const card = waitlistCard(page, label);
  await expect(card.locator('.tz-wl__row')).toHaveCount(1);
  await expect(card.locator('.tz-wl__note')).toContainText('Fikcyjna notatka testowa.');
  const noteId = await card.locator('[data-wl-edit]').getAttribute('data-wl-edit');
  expect((await getNote(page, noteId)).body).toBe(body);
  await card.locator('[data-wl-edit]').click();
  await expect(page.locator('#tzWlNote')).toHaveValue(body);
  await page.locator('#tzWlPrio [data-prio="urgent"]').click();
  await page.locator('#tzWlSave:visible, #tzWlSave2:visible').click();
  await expect(overlay).toHaveCount(0);
  await expect(card.locator('.tz-wl__row')).toHaveClass(/is-urgent/);
  const saved = await getNote(page, noteId);
  expect(saved.body).toBe(body);
  expect(saved.patientId).toBe(chosen.patientId);
  expect(saved.waitlistPriority).toBe('urgent');
  await expect(card.locator('.tz-wl__note')).toContainText('Kontakt po uzgodnieniu terminu.');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), 'no horizontal overflow').toBe(true);
}
