import { expect, test } from '@playwright/test';
import { actionsFixture, OUTCOME, selectActionNote, storedActionNote, WORKSPACE } from '../support/reminders-a8-actions-fixture.mjs';

test.use({ serviceWorkers: 'block', reducedMotion: 'reduce' });
test.setTimeout(120000);

test('A8 actions group keeps menu dismissal local, cancels without writes and runs the real completion, result and rare actions', async ({ page }) => {
  const { notes, ids } = await actionsFixture(page);
  const workspace = page.locator(WORKSPACE);
  await selectActionNote(page, notes.complete);
  const original = await storedActionNote(page, notes.complete);
  const group = workspace.locator('.vb22-action-group');
  await expect(group.getByRole('button', { name: 'Oznacz jako wykonane', exact: true })).toBeVisible();
  await expect(group.getByRole('button', { name: 'Przełóż termin', exact: true })).toBeVisible();
  await expect(group.getByRole('button', { name: 'Edytuj treść przypomnienia', exact: true })).toBeVisible();

  const more = group.locator('details'), summary = more.locator('summary');
  await summary.focus(); await summary.press('Enter');
  await expect(more).toHaveAttribute('open', '');
  await expect(more.getByRole('button', { name: 'Nie zgłosił się', exact: true })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(more).not.toHaveAttribute('open', '');
  await expect(workspace).toBeVisible(); await expect(summary).toBeFocused();
  await summary.click(); await workspace.locator('.vb22-detail-title').click();
  await expect(more).not.toHaveAttribute('open', '');
  expect(await storedActionNote(page, notes.complete)).toEqual(original);

  await group.getByRole('button', { name: 'Przełóż termin', exact: true }).click();
  await page.locator(OUTCOME).getByLabel('Nowy termin', { exact: true }).fill('2027-02-02');
  await page.locator(OUTCOME).getByLabel('Powód zmiany (opcjonalnie)', { exact: true }).fill('Fikcyjny anulowany powód zmiany.');
  await page.locator(OUTCOME).getByRole('button', { name: 'Anuluj', exact: true }).click();
  expect(await storedActionNote(page, notes.complete)).toEqual(original);
  await group.getByRole('button', { name: 'Oznacz jako wykonane', exact: true }).click();
  await page.locator(OUTCOME).getByLabel('Co zostało zrobione? (opcjonalnie)', { exact: true }).fill('Fikcyjny anulowany opis wykonania.');
  await page.locator(OUTCOME).getByRole('button', { name: 'Anuluj', exact: true }).click();
  expect(await storedActionNote(page, notes.complete)).toEqual(original);

  await group.getByRole('button', { name: 'Edytuj treść przypomnienia', exact: true }).click();
  const editor = page.locator('.vilda-patient-note-editor-overlay');
  await expect(editor).toBeVisible(); await editor.locator('textarea').first().fill('Fikcyjny niezapisany tekst edytora.');
  const confirmations = [];
  const acceptDiscard = async dialog => { confirmations.push(dialog.message()); await dialog.accept(); };
  page.once('dialog', acceptDiscard);
  await editor.getByRole('button', { name: 'Anuluj', exact: true }).click();
  await expect(editor).toHaveCount(0); expect(confirmations).toHaveLength(1);
  expect(confirmations[0]).toContain('niezapisan');
  expect(await storedActionNote(page, notes.complete)).toEqual(original);
  if (!await workspace.isVisible()) await page.locator('#vildaRemindersBtn').click();
  await selectActionNote(page, notes.complete);
  await workspace.locator('.vb22-action-group').getByRole('button', { name: 'Oznacz jako wykonane', exact: true }).click();
  await page.locator(OUTCOME).getByLabel('Co zostało zrobione? (opcjonalnie)', { exact: true }).fill('Fikcyjny MR umówiono na 02.02.2027.');
  await page.locator(OUTCOME).getByRole('button', { name: 'Zapisz wykonanie', exact: true }).click();
  await expect(page.locator(OUTCOME)).toHaveCount(0);
  const completed = await storedActionNote(page, notes.complete);
  expect(completed.completedAtISO).toBeTruthy(); expect(completed.body).toContain('Fikcyjny MR umówiono na 02.02.2027.');
  expect(completed.dueDateISO).toBe(original.dueDateISO); expect(completed.patientId).toBe(ids.a);
  await expect(workspace.locator('[data-tab=active]')).toHaveAttribute('aria-pressed', 'true');
  await expect(workspace.locator('.vb22-detail-title')).toHaveText(original.title);

  await selectActionNote(page, notes.result);
  await workspace.locator('.vb22-action-group').getByRole('button', { name: 'Dodaj wynik do kartoteki', exact: true }).click();
  await page.locator(OUTCOME).getByLabel('Opis otrzymanego wyniku', { exact: true }).fill('Fikcyjny wynik opisowy biopsji A8.');
  await page.locator(OUTCOME).getByRole('button', { name: 'Zapisz wynik', exact: true }).click();
  await expect(page.locator(OUTCOME)).toHaveCount(0);
  const resultParent = await storedActionNote(page, notes.result);
  const result = await storedActionNote(page, resultParent.reminderContext.resultNoteId);
  expect(resultParent.completedAtISO).toBeTruthy(); expect(result.patientId).toBe(ids.b);
  expect(result.body).toContain('Fikcyjny wynik opisowy biopsji A8.'); expect(result.clinicalDateISO).toBeNull();

  await selectActionNote(page, notes.noshow);
  await workspace.locator('.vb22-action-group summary').click();
  await workspace.locator('.vb22-action-group').getByRole('button', { name: 'Nie zgłosił się', exact: true }).click();
  await expect.poll(async () => Boolean((await storedActionNote(page, notes.noshow)).noShowAtISO)).toBe(true);
  await expect(workspace.locator(`[data-note-id="${notes.noshow}"]`)).toHaveCount(0);
  await selectActionNote(page, notes.recheck);
  const beforeRecheck = await storedActionNote(page, notes.recheck);
  await workspace.locator('.vb22-action-group summary').click();
  await workspace.locator('.vb22-action-group').getByRole('button', { name: 'Jeszcze nie ma → za 3 dni', exact: true }).click();
  await expect.poll(async () => (await storedActionNote(page, notes.recheck)).dueDateISO).toBe('2026-11-01T00:00:00.000Z');
  const rechecked = await storedActionNote(page, notes.recheck);
  expect(rechecked.completedAtISO).toBeNull(); expect(rechecked.body).toBe(beforeRecheck.body); expect(rechecked.patientId).toBe(ids.b);
  await expect(workspace.locator(`[data-note-id="${notes.recheck}"]`)).toHaveCount(0);
});
