import { expect, test } from '@playwright/test';
import { actionsFixture, OUTCOME, selectActionNote, storedActionNote, WORKSPACE } from '../support/reminders-a8-actions-fixture.mjs';

test.use({ serviceWorkers: 'block', reducedMotion: 'reduce' });
test.setTimeout(120000);

test('A8 touch actions have hittable 44px controls through phone widths and rotation, with unchanged records after cancellation', async ({ page }) => {
  const { notes } = await actionsFixture(page);
  const workspace = page.locator(WORKSPACE);
  await selectActionNote(page, notes.complete);
  const original = await storedActionNote(page, notes.complete);
  for (const viewport of [{ width: 320, height: 800 }, { width: 393, height: 852 }, { width: 852, height: 393 }]) {
    await page.setViewportSize(viewport);
    const group = workspace.locator('.vb22-action-group');
    for (const control of [
      group.getByRole('button', { name: 'Oznacz jako wykonane', exact: true }),
      group.getByRole('button', { name: 'Przełóż termin', exact: true }),
      group.getByRole('button', { name: 'Edytuj treść przypomnienia', exact: true }),
      group.locator('summary'),
    ]) {
      await control.scrollIntoViewIfNeeded();
      const hit = await control.evaluate(node => {
        const rect = node.getBoundingClientRect();
        const target = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
        return { width: rect.width, height: rect.height, visible: rect.top >= 0 && rect.bottom <= innerHeight + 1,
          target: target === node || node.contains(target) };
      });
      expect(hit.width).toBeGreaterThanOrEqual(44); expect(hit.height).toBeGreaterThanOrEqual(44);
      expect(hit.visible).toBe(true); expect(hit.target).toBe(true);
    }
    await group.locator('summary').tap(); await expect(group.locator('details')).toHaveAttribute('open', '');
    const rare = group.getByRole('button', { name: 'Nie zgłosił się', exact: true });
    await rare.scrollIntoViewIfNeeded();
    const rareHit = await rare.evaluate(node => {
      const rect = node.getBoundingClientRect(), target = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
      return { height: rect.height, target: target === node || node.contains(target) };
    });
    expect(rareHit.height).toBeGreaterThanOrEqual(44); expect(rareHit.target).toBe(true);
    await page.keyboard.press('Escape');
    await expect(group.locator('details')).not.toHaveAttribute('open', '');
    await expect(workspace).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  }
  await page.setViewportSize({ width: 393, height: 852 });
  const group = workspace.locator('.vb22-action-group');
  await group.getByRole('button', { name: 'Przełóż termin', exact: true }).tap();
  await page.locator(OUTCOME).getByLabel('Nowy termin', { exact: true }).fill('2027-02-02');
  await page.locator(OUTCOME).getByRole('button', { name: 'Anuluj', exact: true }).tap();
  expect(await storedActionNote(page, notes.complete)).toEqual(original);
  await group.getByRole('button', { name: 'Oznacz jako wykonane', exact: true }).tap();
  await page.locator(OUTCOME).getByLabel('Co zostało zrobione? (opcjonalnie)', { exact: true }).fill('Fikcyjny niezapisany opis mobilny.');
  await page.locator(OUTCOME).getByRole('button', { name: 'Anuluj', exact: true }).tap();
  expect(await storedActionNote(page, notes.complete)).toEqual(original);
  await workspace.getByRole('button', { name: '← Lista spraw', exact: true }).tap();
  await selectActionNote(page, notes.result);
  const originalResult = await storedActionNote(page, notes.result);
  await workspace.locator('.vb22-action-group').getByRole('button', { name: 'Dodaj wynik do kartoteki', exact: true }).tap();
  await page.locator(OUTCOME).getByLabel('Opis otrzymanego wyniku', { exact: true }).fill('Fikcyjny anulowany wynik mobilny.');
  await page.locator(OUTCOME).getByRole('button', { name: 'Anuluj', exact: true }).tap();
  expect(await storedActionNote(page, notes.result)).toEqual(originalResult);
  await expect(workspace.locator('.vb22-detail-title')).toHaveText(originalResult.title);
});
