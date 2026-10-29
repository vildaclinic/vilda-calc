import { expect, test } from '@playwright/test';
import { createFictionalVault } from '../support/centile-live-fixture.mjs';

test.use({ serviceWorkers: 'block', reducedMotion: 'reduce', viewport: { width: 393, height: 852 } });
test.setTimeout(120000);

test('A8 a committed outcome remains saved with a working back button when subsequent reads fail', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-10-29T10:00:00+01:00'));
  const { ids } = await createFictionalVault(page);
  const notes = await page.evaluate(async patientId => {
    const notes = {};
    for (const stage of ['note', 'groups']) notes[stage] = (await window.VildaVault.savePatientNote({
      patientId, title: 'Fikcyjna read-commit A8 ' + stage, category: 'reminder-task',
      dueDateISO: '2026-10-20', body: 'Fikcyjny opis przed wykonaniem.',
    })).id;
    const vault = window.VildaVault, save = vault.saveReminderOutcome, note = vault.getPatientNote, groups = vault.listPatientNotesDueByDate;
    window.__a8CommittedCalls = 0; window.__a8ConfiguredFailure = null; window.__a8ReadFailure = null;
    vault.saveReminderOutcome = async function (...args) {
      const result = await save.apply(this, args);
      if (result.saved) { window.__a8CommittedCalls += 1; window.__a8ReadFailure = window.__a8ConfiguredFailure; }
      return result;
    };
    vault.getPatientNote = function (...args) {
      if (window.__a8ReadFailure === 'note') return Promise.reject(Error('Fikcyjna awaria odczytu zapisanej sprawy.'));
      return note.apply(this, args);
    };
    vault.listPatientNotesDueByDate = function (...args) {
      if (window.__a8ReadFailure === 'groups') return Promise.reject(Error('Fikcyjna awaria odświeżenia listy.'));
      return groups.apply(this, args);
    };
    return notes;
  }, ids.a);
  await page.locator('#vildaRemindersBtn').tap();
  const workspace = page.locator('dialog.vb22-modal');
  for (const [index, stage] of ['note', 'groups'].entries()) {
    const title = 'Fikcyjna read-commit A8 ' + stage;
    await workspace.getByRole('searchbox', { name: 'Szukaj pacjenta lub sprawy' }).fill(title);
    await workspace.locator(`[data-note-id="${notes[stage]}"]`).tap();
    await page.evaluate(value => { window.__a8ConfiguredFailure = value; }, stage);
    await workspace.getByRole('button', { name: 'Oznacz jako wykonane', exact: true }).tap();
    const editor = page.locator('dialog.vb22-outcome');
    await editor.getByLabel('Co zostało zrobione? (opcjonalnie)', { exact: true }).fill('Fikcyjny opis zapisu A8 ' + stage);
    await editor.getByRole('button', { name: 'Zapisz wykonanie', exact: true }).tap();
    await expect(editor).toHaveCount(0);
    await expect(workspace.locator('[data-tab=active]')).toHaveAttribute('aria-pressed', 'true');
    await expect(workspace.locator('.vb22-detail-title')).toHaveText(title);
    await expect(workspace.locator('.vb22-detail').getByRole('alert')).toContainText('Zapisano zmiany, ale nie udało się odświeżyć');
    const back = workspace.getByRole('button', { name: '← Lista spraw', exact: true });
    await expect(back).toBeVisible();
    expect(await back.evaluate(node => {
      const rect = node.getBoundingClientRect(), target = document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2);
      return target === node || node.contains(target);
    })).toBe(true);
    await expect(workspace.getByRole('button', { name: 'Oznacz jako wykonane', exact: true })).toHaveCount(0);
    expect(await page.evaluate(() => window.__a8CommittedCalls)).toBe(index + 1);
    await page.evaluate(() => { window.__a8ReadFailure = null; });
    await workspace.getByRole('button', { name: 'Odśwież zapis', exact: true }).tap();
    await expect(workspace.locator('.vb22-detail').getByRole('alert')).toHaveCount(0);
    await expect(workspace.locator('.vb22-body')).toContainText('Fikcyjny opis zapisu A8 ' + stage);
    expect(await page.evaluate(() => window.__a8CommittedCalls)).toBe(index + 1);
    const stored = await page.evaluate(id => window.VildaVault.getPatientNote(id), notes[stage]);
    expect(stored.completedAtISO).toBeTruthy(); expect(stored.body).toContain('Fikcyjny opis zapisu A8 ' + stage);
    await back.tap();
    await expect(workspace.getByRole('searchbox', { name: 'Szukaj pacjenta lub sprawy' })).toHaveValue(title);
  }
});
