import { expect } from '@playwright/test';
import { createFictionalVault } from './centile-live-fixture.mjs';

export const WORKSPACE = 'dialog.vb22-modal';
export const OUTCOME = 'dialog.vb22-outcome';

export async function actionsFixture(page) {
  await page.clock.setFixedTime(new Date('2026-10-29T10:00:00+01:00'));
  const created = await createFictionalVault(page);
  const notes = await page.evaluate(async ids => {
    const specs = [
      ['complete', ids.a, 'followup', 'Fikcyjne ustalenie MR A8', null],
      ['result', ids.b, 'wynik-badania', 'Fikcyjna biopsja A8', 3],
      ['noshow', ids.a, 'followup', 'Fikcyjna kontrola A8', null],
      ['recheck', ids.b, 'wynik-badania', 'Fikcyjny wynik oczekujący A8', 3],
    ];
    const notes = {};
    for (const [key, patientId, category, title, recheckDays] of specs) {
      const saved = await window.VildaVault.savePatientNote({
        patientId, category, title, recheckDays,
        body: 'Fikcyjne pierwotne ustalenia do zachowania.', dueDateISO: '2026-10-26', dueTime: '09:00',
      });
      notes[key] = saved.id;
    }
    return notes;
  }, created.ids);
  await page.locator('#vildaRemindersBtn').click();
  await expect(page.locator(WORKSPACE)).toBeVisible();
  return { ...created, notes };
}

export async function selectActionNote(page, id) {
  await page.locator(`${WORKSPACE} [data-note-id="${id}"]`).click();
  await expect(page.locator(`${WORKSPACE} .vb22-detail`)).toBeVisible();
}

export const storedActionNote = (page, id) => page.evaluate(id => window.VildaVault.getPatientNote(id), id);
