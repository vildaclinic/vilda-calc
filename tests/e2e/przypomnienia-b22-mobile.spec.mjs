import { expect, test } from '@playwright/test';
import { createFictionalVault } from '../support/centile-live-fixture.mjs';

test.use({ serviceWorkers: 'block', reducedMotion: 'reduce' });
test.setTimeout(120000);
const DIALOG = 'dialog.vb22';
async function setup(page) {
  const created = await createFictionalVault(page, { shell: true });
  const noteId = await created.frame.evaluate(async patientId => (await window.VildaVault.savePatientNote({ patientId, title: 'Fikcyjne mobilne MR B22', body: 'Fikcyjne pierwotne ustalenia.', category: 'reminder-exam', dueDateISO: new Date().toLocaleDateString('sv') })).id, created.ids.a);
  await expect(page.locator('#vildaRemindersBtn')).toHaveAttribute('data-count', '1');
  await page.locator('#vildaRemindersBtn').click(); await expect(page.locator(DIALOG)).toBeVisible();
  return { ...created, noteId };
}

test('B2.2 mobile: completion form remains usable through portrait/landscape and saves the next step', async ({ page }) => {
  const { noteId, ids } = await setup(page); await page.locator(`${DIALOG} [data-note-id="${noteId}"]`).click();
  await page.locator(DIALOG).getByRole('button', { name: 'Oznacz jako wykonane', exact: true }).click();
  const description = page.locator(DIALOG).getByLabel('Co zostało zrobione? (opcjonalnie)', { exact: true }); await description.fill('Fikcyjne MR umówione na 02.02.2027 r.');
  await page.locator(DIALOG).getByLabel('Dodaj kolejny krok z własnym terminem').check();
  await page.locator(DIALOG).getByLabel('Kolejny krok', { exact: true }).fill('Sprawdzić fikcyjne MR po badaniu');
  await page.locator(DIALOG).getByLabel('Termin kolejnego kroku', { exact: true }).fill('2027-02-02');
  for (const viewport of [{ width: 393, height: 852 }, { width: 852, height: 393 }, { width: 393, height: 852 }]) {
    await page.setViewportSize(viewport); await expect(description).toHaveValue('Fikcyjne MR umówione na 02.02.2027 r.');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    const save = page.locator(DIALOG).getByRole('button', { name: 'Zapisz wykonanie', exact: true }); await save.scrollIntoViewIfNeeded();
    const hit = await save.evaluate(node => { const r = node.getBoundingClientRect(), target = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2); return target === node || node.contains(target); });
    expect(hit).toBe(true);
  }
  await page.screenshot({ path: test.info().outputPath('b22-phone-completion.png') });
  await page.locator(DIALOG).getByRole('button', { name: 'Zapisz wykonanie', exact: true }).click(); await expect(page.locator(`${DIALOG} .vb22-notice`)).toContainText('Zapisano');
  const record = await page.evaluate(async ({ id, patientId }) => { const parent = await window.VildaVault.getPatientNote(id); return { parent, all: await window.VildaVault.listPatientNotesForPatient(patientId) }; }, { id: noteId, patientId: ids.a });
  expect(record.parent.completedAtISO).toBeTruthy(); expect(record.parent.body).toContain('02.02.2027'); expect(record.all.find(n => n.id === record.parent.reminderContext.nextId)).toBeTruthy();
});

test('B2.2 mobile: generic contact reminder reaches the real patient record', async ({ page }) => {
  const { ids } = await setup(page); await page.locator(DIALOG).getByRole('button', { name: 'Dodaj przypomnienie', exact: true }).click();
  await page.locator(DIALOG).getByLabel('Pacjent', { exact: true }).selectOption(ids.a); await page.locator(DIALOG).getByLabel('Rodzaj przypomnienia').selectOption('reminder-contact');
  await page.locator(DIALOG).getByLabel('Treść przypomnienia', { exact: true }).fill('Fikcyjny kontakt mobilny B22'); await page.locator(DIALOG).getByLabel('Godzina (opcjonalnie)', { exact: true }).fill('14:30');
  await page.locator(DIALOG).getByRole('button', { name: 'Zapisz przypomnienie', exact: true }).click(); await expect(page.locator(`${DIALOG} h3`)).toHaveText('Fikcyjny kontakt mobilny B22');
  const notes = await page.evaluate(id => window.VildaVault.listPatientNotesForPatient(id), ids.a); expect(notes.filter(n => n.title === 'Fikcyjny kontakt mobilny B22')).toHaveLength(1); expect(notes.find(n => n.title === 'Fikcyjny kontakt mobilny B22').dueTime).toBe('14:30');
});

test('B2.2 mobile: locking removes the workspace and draft text', async ({ page }) => {
  const { noteId } = await setup(page); await page.locator(`${DIALOG} [data-note-id="${noteId}"]`).click(); await page.locator(DIALOG).getByRole('button', { name: 'Oznacz jako wykonane', exact: true }).click();
  await page.locator(DIALOG).getByLabel('Co zostało zrobione? (opcjonalnie)', { exact: true }).fill('Fikcyjny tekst, który ma zniknąć po blokadzie.');
  await page.evaluate(() => window.VildaVault.lock('manual'));
  await expect(page.locator(DIALOG)).toHaveCount(0); await expect(page.locator('body')).not.toContainText('Fikcyjny tekst, który ma zniknąć');
});
