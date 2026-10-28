import { expect, test } from '@playwright/test';
import { createFictionalVault } from '../support/centile-live-fixture.mjs';

test.use({ serviceWorkers: 'block', reducedMotion: 'reduce' });
test.setTimeout(120000);
const DIALOG = 'dialog.vb22-modal';
async function setup(page) {
  const result = await createFictionalVault(page);
  const notes = await page.evaluate(async ids => {
    const today = new Date(), ymd = date => date.getFullYear() + '-' + String(date.getMonth() + 1).padStart(2, '0') + '-' + String(date.getDate()).padStart(2, '0');
    const past = new Date(today); past.setDate(today.getDate() - 2);
    const future = new Date(today); future.setDate(today.getDate() + 7);
    const fixtures = [
      ['Fikcyjne umówienie MR', 'reminder-exam', past, ids.a], ['Fikcyjny wynik biopsji', 'wynik-badania', past, ids.b],
      ['Fikcyjny kontakt z rodzicem', 'reminder-contact', today, ids.a], ['Fikcyjny wynik TSH', 'wynik-badania', today, ids.b],
      ['Fikcyjna kontrola przyszła', 'followup', future, ids.a],
    ];
    const records = [];
    for (const [title, category, date, patientId] of fixtures) records.push((await window.VildaVault.savePatientNote({ title, category, patientId, body: 'Pierwotna fikcyjna treść.', dueDateISO: ymd(date) })).id);
    return records;
  }, result.ids);
  await expect(page.locator('#remindersInline .vb22-row')).toHaveCount(5);
  return { ...result, notes };
}
async function open(page) { await page.locator('#vildaRemindersBtn').click(); await expect(page.locator(DIALOG)).toBeVisible(); }
async function select(page, id) { await page.locator(`${DIALOG} [data-note-id="${id}"]`).click(); }
async function field(page, label, value) { await page.locator(DIALOG).getByLabel(label, { exact: true }).fill(value); }

test('B2.2 shows header filters, counts all matches, and retains compact rows', async ({ page }) => {
  await setup(page); await open(page);
  await expect(page.locator(`${DIALOG} .vb22-count`)).toHaveText(['5', '2', '2', '2']);
  await page.locator(`${DIALOG} [data-filter=pending]`).click(); await expect(page.locator(`${DIALOG} .vb22-row`)).toHaveCount(2);
  await page.locator(`${DIALOG} [data-filter=today]`).click(); await expect(page.locator(`${DIALOG} .vb22-row`)).toHaveCount(2);
  const color = await page.locator(`${DIALOG} .vb22-count`).first().evaluate(n => getComputedStyle(n).color);
  expect(color).toBe('rgb(149, 82, 91)');
  await page.screenshot({ path: test.info().outputPath('reminders-b22-desktop.png') });
});

test('generic add saves a contact reminder with its patient and time', async ({ page }) => {
  const { ids } = await setup(page); await open(page);
  await page.locator(DIALOG).getByRole('button', { name: 'Dodaj przypomnienie', exact: true }).click();
  await page.locator(DIALOG).getByLabel('Pacjent', { exact: true }).selectOption(ids.a);
  await page.locator(DIALOG).getByLabel('Rodzaj przypomnienia').selectOption('reminder-contact');
  await field(page, 'Treść przypomnienia', 'Fikcyjny telefon do rodzica B22'); await field(page, 'Godzina (opcjonalnie)', '14:30');
  await field(page, 'Dodatkowe informacje (opcjonalnie)', 'Ustalenia z rodzicem.');
  await page.locator(DIALOG).getByRole('button', { name: 'Zapisz przypomnienie', exact: true }).click();
  await expect(page.locator(`${DIALOG} h3`)).toHaveText('Fikcyjny telefon do rodzica B22');
  const note = await page.evaluate(async id => (await window.VildaVault.listPatientNotesForPatient(id)).find(n => n.title === 'Fikcyjny telefon do rodzica B22'), ids.a);
  expect(note).toMatchObject({ patientId: ids.a, dueTime: '14:30', body: 'Ustalenia z rodzicem.', completedAtISO: null });
});

test('completion and next step survive reload and remain linked in the patient notes', async ({ page }) => {
  const { notes, ids } = await setup(page); await open(page); await select(page, notes[0]);
  await page.locator(DIALOG).getByRole('button', { name: 'Oznacz jako wykonane', exact: true }).click();
  await field(page, 'Co zostało zrobione? (opcjonalnie)', 'Umówiłem fikcyjne MR na 02.02.2027 r.');
  await page.locator(DIALOG).getByLabel('Dodaj kolejny krok z własnym terminem').check();
  await field(page, 'Kolejny krok', 'Fikcyjne MR — sprawdzić wykonanie'); await field(page, 'Termin kolejnego kroku', '2027-02-02');
  await page.locator(DIALOG).getByRole('button', { name: 'Zapisz wykonanie', exact: true }).click();
  await expect(page.locator(`${DIALOG} .vb22-notice`)).toContainText('Zapisano w Karcie pacjenta');
  await page.locator(DIALOG).getByRole('button', { name: 'Otwórz kolejny krok →', exact: true }).click();
  await expect(page.locator(`${DIALOG} h3`)).toHaveText('Fikcyjne MR — sprawdzić wykonanie');
  await page.reload();
  const stored = await page.evaluate(async ({ patientId, id }) => ({ notes: await window.VildaVault.listPatientNotesForPatient(patientId), parent: await window.VildaVault.getPatientNote(id) }), { patientId: ids.a, id: notes[0] });
  expect(stored.parent.completedAtISO).toBeTruthy(); expect(stored.parent.body).toContain('Pierwotna fikcyjna treść.'); expect(stored.parent.body).toContain('02.02.2027');
  expect(stored.notes.find(n => n.id === stored.parent.reminderContext.nextId).reminderContext.parentId).toBe(notes[0]);
});

test('narrative biopsy saves its full text at the patient and closes the waiting task', async ({ page }) => {
  const { notes, ids } = await setup(page); await open(page); await select(page, notes[1]);
  await page.locator(DIALOG).getByRole('button', { name: 'Dodaj wynik do kartoteki', exact: true }).click();
  const narrative = 'Fikcyjny opis otrzymanej biopsji. '.repeat(12); await field(page, 'Opis otrzymanego wyniku', narrative);
  await page.locator(DIALOG).getByRole('button', { name: 'Zapisz wynik i zamknij sprawę', exact: true }).click();
  await expect(page.locator(`${DIALOG} .vb22-notice`)).toContainText('Wynik zapisany');
  const data = await page.evaluate(async ({ id, patientId }) => { const parent = await window.VildaVault.getPatientNote(id); return { parent, result: await window.VildaVault.getPatientNote(parent.reminderContext.resultNoteId), series: await window.VildaVault.listPatientLabSeries(patientId) }; }, { id: notes[1], patientId: ids.b });
  expect(data.result.body).toContain(narrative.trim()); expect(data.parent.completedAtISO).toBeTruthy(); expect(data.result.clinicalDateISO).toBeNull(); expect(data.series).toEqual([]);
});

test('a failed save preserves typed description and permits an idempotent retry', async ({ page }) => {
  const { notes } = await setup(page); await open(page); await select(page, notes[0]);
  await page.locator(DIALOG).getByRole('button', { name: 'Oznacz jako wykonane', exact: true }).click(); await field(page, 'Co zostało zrobione? (opcjonalnie)', 'Fikcyjny opis do zachowania.');
  await page.evaluate(() => { const native = window.VildaVault.saveReminderOutcome; let first = true; window.VildaVault.saveReminderOutcome = payload => { if (first) { first = false; return Promise.reject(Error('Fikcyjny błąd zapisu')); } return native(payload); }; });
  await page.locator(DIALOG).getByRole('button', { name: 'Zapisz wykonanie', exact: true }).click();
  await expect(page.locator(DIALOG).getByRole('alert')).toContainText('Fikcyjny błąd zapisu'); await expect(page.locator(DIALOG).getByLabel('Co zostało zrobione? (opcjonalnie)', { exact: true })).toHaveValue('Fikcyjny opis do zachowania.');
  await page.locator(DIALOG).getByRole('button', { name: 'Zapisz wykonanie', exact: true }).click(); await expect(page.locator(`${DIALOG} .vb22-notice`)).toBeVisible();
});

test('refresh does not overwrite an open editor and stale edits cannot replace a newer note', async ({ page }) => {
  const { notes, ids } = await setup(page); await open(page); await select(page, notes[0]);
  await page.locator(DIALOG).getByRole('button', { name: 'Oznacz jako wykonane', exact: true }).click(); await field(page, 'Co zostało zrobione? (opcjonalnie)', 'Mój niezapisany fikcyjny opis.');
  await page.evaluate(({ id, patientId }) => window.VildaVault.savePatientNote({ id, patientId, body: 'Nowszy zapis z drugiej karty.' }), { id: notes[0], patientId: ids.a });
  await page.locator(DIALOG).getByRole('button', { name: 'Zapisz wykonanie', exact: true }).click(); await expect(page.locator(DIALOG).getByRole('alert')).toContainText('zmieniła się');
  await expect(page.locator(DIALOG).getByLabel('Co zostało zrobione? (opcjonalnie)', { exact: true })).toHaveValue('Mój niezapisany fikcyjny opis.');
  expect((await page.evaluate(id => window.VildaVault.getPatientNote(id), notes[0])).body).toBe('Nowszy zapis z drugiej karty.');
});

test('the bell opens an empty workspace so the first reminder can be created', async ({ page }) => {
  await createFictionalVault(page); await open(page); await expect(page.locator(DIALOG)).toContainText('Brak przypomnień na dziś');
  await page.locator(DIALOG).getByRole('button', { name: 'Dodaj przypomnienie', exact: true }).click(); await expect(page.locator(DIALOG).getByLabel('Treść przypomnienia')).toBeVisible();
});

test('an actual IndexedDB child-write failure rolls back the parent and permits retry', async ({ page }) => {
  const { notes, ids } = await setup(page); await open(page); await select(page, notes[0]);
  await page.locator(DIALOG).getByRole('button', { name: 'Oznacz jako wykonane', exact: true }).click();
  await field(page, 'Co zostało zrobione? (opcjonalnie)', 'Fikcyjny opis atomowego zapisu.');
  await page.locator(DIALOG).getByLabel('Dodaj kolejny krok z własnym terminem').check();
  await field(page, 'Kolejny krok', 'Fikcyjny kolejny krok IDB'); await field(page, 'Termin kolejnego kroku', '2027-02-02');
  await page.evaluate(() => { const native = IDBObjectStore.prototype.put; let failed = false; IDBObjectStore.prototype.put = function (value, ...rest) { if (!failed && value?.id?.startsWith('rem-next-')) { failed = true; throw Error('Fikcyjna awaria drugiego zapisu IDB'); } return native.call(this, value, ...rest); }; });
  await page.locator(DIALOG).getByRole('button', { name: 'Zapisz wykonanie', exact: true }).click();
  await expect(page.locator(DIALOG).getByRole('alert')).toContainText('Fikcyjna awaria');
  const before = await page.evaluate(async ({ id, patientId }) => ({ parent: await window.VildaVault.getPatientNote(id), notes: await window.VildaVault.listPatientNotesForPatient(patientId) }), { id: notes[0], patientId: ids.a });
  expect(before.parent.completedAtISO).toBeNull(); expect(before.notes.some(n => n.title === 'Fikcyjny kolejny krok IDB')).toBe(false);
  await page.locator(DIALOG).getByRole('button', { name: 'Zapisz wykonanie', exact: true }).click(); await expect(page.locator(`${DIALOG} .vb22-notice`)).toContainText('Zapisano');
});

test('an agreed appointment date is kept at the patient separately from the reminder date', async ({ page }) => {
  const { ids } = await setup(page); await open(page); await page.locator(DIALOG).getByRole('button', { name: 'Dodaj przypomnienie', exact: true }).click();
  await page.locator(DIALOG).getByLabel('Pacjent', { exact: true }).selectOption(ids.a);
  await page.locator(DIALOG).getByLabel('Rodzaj przypomnienia').selectOption('reminder-exam');
  await field(page, 'Treść przypomnienia', 'MR — potwierdzony fikcyjny termin'); await field(page, 'Przypomnij w dniu', '2027-01-26');
  await field(page, 'Ustalony termin badania / wizyty (opcjonalnie)', '2027-02-02'); await field(page, 'Godzina badania / wizyty (opcjonalnie)', '09:30');
  await page.locator(DIALOG).getByRole('button', { name: 'Zapisz przypomnienie', exact: true }).click();
  await expect(page.locator(`${DIALOG} .vb22-body`)).toContainText('02.02.2027 · 09:30');
  const note = await page.evaluate(async id => (await window.VildaVault.listPatientNotesForPatient(id)).find(n => n.title === 'MR — potwierdzony fikcyjny termin'), ids.a);
  expect(note.dueDateISO).toContain('2027-01-26'); expect(note.body).toContain('02.02.2027');
  await page.locator(DIALOG).getByRole('button', { name: /otwórz Kartę pacjenta/ }).click();
  await expect(page.locator('.vilda-auth-patient-card')).toContainText('MR — potwierdzony fikcyjny termin');
  await expect(page.locator('.vilda-auth-patient-card')).toContainText('02.02.2027');
});

test('a delayed history read cannot undo newer navigation or replace an add form', async ({ page }) => {
  await setup(page); await open(page);
  await page.evaluate(() => {
    const native = window.VildaVault.listPatientNotesInRange;
    window.VildaVault.listPatientNotesInRange = async (...args) => {
      const notes = await native(...args);
      await new Promise(resolve => { window.__releaseB22History = resolve; });
      return notes;
    };
  });
  const dialog = page.locator(DIALOG);
  await dialog.getByRole('button', { name: 'Historia', exact: true }).click();
  await page.waitForFunction(() => Boolean(window.__releaseB22History));
  await dialog.getByRole('button', { name: /^Do wykonania/ }).click();
  await page.evaluate(() => { window.__releaseB22History(); window.__releaseB22History = null; });
  await expect(dialog.getByRole('button', { name: /^Do wykonania/ })).toHaveClass(/is-active/);
  await expect(dialog.locator('.vb22-row')).toHaveCount(5);
  await dialog.getByRole('button', { name: 'Historia', exact: true }).click();
  await page.waitForFunction(() => Boolean(window.__releaseB22History));
  await dialog.getByRole('button', { name: 'Dodaj przypomnienie', exact: true }).click();
  await dialog.getByLabel('Treść przypomnienia', { exact: true }).fill('Fikcyjny nowy opis podczas odczytu historii');
  await page.evaluate(() => window.__releaseB22History());
  await expect(dialog.getByLabel('Treść przypomnienia', { exact: true })).toHaveValue('Fikcyjny nowy opis podczas odczytu historii');
  await expect(dialog.getByRole('button', { name: 'Zapisz przypomnienie', exact: true })).toBeVisible();
});

test('closing through the existing cross-tab signal restores navigation before reopening', async ({ page }) => {
  await setup(page); await open(page);
  await page.evaluate(() => dispatchEvent(new StorageEvent('storage', {
    key: 'vilda-reminders-closed-v1', newValue: 'fictional-close',
  })));
  await expect(page.locator(DIALOG)).toHaveCount(0);
  expect(await page.evaluate(() => document.body.classList.contains('nav-ui-temporarily-hidden'))).toBe(false);
  await open(page);
  await page.locator(DIALOG).getByRole('button', { name: 'Zamknij Przypomnienia', exact: true }).click();
  await expect(page.locator(DIALOG)).toHaveCount(0);
  expect(await page.evaluate(() => document.body.classList.contains('nav-ui-temporarily-hidden'))).toBe(false);
});
