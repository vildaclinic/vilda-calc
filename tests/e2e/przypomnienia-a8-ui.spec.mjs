import { expect, test } from '@playwright/test';
import { createFictionalVault } from '../support/centile-live-fixture.mjs';

test.use({ serviceWorkers: 'block', reducedMotion: 'reduce' });
test.setTimeout(120000);
const WORKSPACE = 'dialog.vb22-modal';

test('A8 opening focuses the title, keyboard actions retain a focus ring, and History is responsive and paged', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-10-29T10:00:00+01:00'));
  const { ids } = await createFictionalVault(page);
  await page.evaluate(async id => {
    for (let index = 0; index < 64; index += 1) await window.VildaVault.savePatientNote({
      patientId: id, category: 'reminder-task', title: 'Fikcyjna zakończona A8 ' + String(index).padStart(3, '0'),
      dueDateISO: '2026-10-20', completedAtISO: '2026-10-21T09:00:00.000Z',
    });
    const read = window.VildaVault.listReminderHistory;
    let pause = true;
    window.VildaVault.listReminderHistory = async function (...args) {
      const notes = await read.apply(this, args);
      if (pause) { pause = false; await new Promise(resolve => { window.__a8ReleaseHistory = resolve; }); }
      return notes;
    };
    const range = window.VildaVault.listPatientNotesInRange;
    window.__a8WholeCalendarReads = 0;
    window.VildaVault.listPatientNotesInRange = function (...args) {
      if (args[0] === '0001-01-01') window.__a8WholeCalendarReads += 1;
      return range.apply(this, args);
    };
  }, ids.a);
  await page.locator('#vildaRemindersBtn').focus(); await page.keyboard.press('Enter');
  const workspace = page.locator(WORKSPACE);
  await expect(workspace).toBeVisible();
  expect(await workspace.locator('.vb22-head h2').evaluate(node => document.activeElement === node)).toBe(true);
  const add = workspace.getByRole('button', { name: 'Dodaj przypomnienie', exact: true });
  expect(await add.evaluate(node => node.matches(':focus-visible'))).toBe(false);
  await page.keyboard.press('Tab');
  await expect(add).toBeFocused();
  expect(await add.evaluate(node => parseFloat(getComputedStyle(node).outlineWidth))).toBeGreaterThan(0);
  expect(await workspace.locator('.vb22-list-pane').evaluate(node => getComputedStyle(node).backgroundColor)).toBe('rgb(255, 255, 255)');

  const history = workspace.locator('[data-tab=history]');
  await history.click();
  await expect(history).toHaveAttribute('aria-pressed', 'true');
  await expect(workspace.getByRole('status')).toHaveText('Wczytywanie historii…');
  await expect(workspace.locator('.vb22-list')).toHaveAttribute('aria-busy', 'true');
  await page.waitForFunction(() => Boolean(window.__a8ReleaseHistory));
  await workspace.locator('[data-tab=active]').click();
  await page.evaluate(() => window.__a8ReleaseHistory());
  await expect(workspace.locator('[data-tab=active]')).toHaveAttribute('aria-pressed', 'true');
  await history.click(); await expect(workspace.locator('.vb22-row')).toHaveCount(50);
  await expect(history.locator('.vb22-tab-count')).toHaveCount(0);
  await expect(workspace.locator('.vb22-list')).toHaveAttribute('aria-busy', 'false');
  await workspace.getByRole('button', { name: 'Pokaż kolejne 14 spraw', exact: true }).click();
  await expect(workspace.locator('.vb22-row')).toHaveCount(64);
  const search = workspace.getByRole('searchbox', { name: 'Szukaj pacjenta lub sprawy' });
  await search.fill('Fikcyjna zakończona A8 000');
  await expect(workspace.locator('.vb22-row')).toHaveCount(1);
  await expect(workspace.locator('.vb22-row-title')).toHaveText('Fikcyjna zakończona A8 000');
  expect(await page.evaluate(() => window.__a8WholeCalendarReads)).toBe(0);
});
