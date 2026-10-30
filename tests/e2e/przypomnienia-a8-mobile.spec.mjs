import { expect, test } from '@playwright/test';
import { createFictionalVault } from '../support/centile-live-fixture.mjs';

test.use({ serviceWorkers: 'block', reducedMotion: 'reduce', viewport: { width: 393, height: 852 } });
test.setTimeout(120000);
const WORKSPACE = 'dialog.vb22-modal';

test('A8 completing a task keeps the active context and the completed details on a phone', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-10-29T10:00:00+01:00'));
  const { ids } = await createFictionalVault(page);
  const noteIds = await page.evaluate(async patientId => {
    const ids = [];
    for (const suffix of ['pierwsza', 'druga']) ids.push((await window.VildaVault.savePatientNote({
      patientId, title: 'Fikcyjna sprawa mobilna A8 ' + suffix, category: 'reminder-task',
      body: 'Fikcyjne pierwotne ustalenia.', dueDateISO: '2026-10-20',
    })).id);
    return ids;
  }, ids.a);
  await page.locator('#vildaRemindersBtn').tap(); const workspace = page.locator(WORKSPACE);
  expect(await workspace.locator('.vb22-list-pane').evaluate(node => getComputedStyle(node).backgroundColor)).toBe('rgb(255, 255, 255)');
  expect(await workspace.getByRole('button', { name: 'Dodaj przypomnienie', exact: true }).evaluate(node => node.matches(':focus-visible'))).toBe(false);
  await workspace.locator('[data-filter=overdue]').tap();
  const search = workspace.getByRole('searchbox', { name: 'Szukaj pacjenta lub sprawy' });
  await search.fill('Fikcyjna sprawa mobilna A8');
  await workspace.locator(`[data-note-id="${noteIds[0]}"]`).tap();
  await workspace.getByRole('button', { name: 'Oznacz jako wykonane', exact: true }).tap();
  const form = page.locator('dialog.vb22-outcome');
  await form.getByLabel('Co zostało zrobione? (opcjonalnie)', { exact: true }).fill('Fikcyjne MR umówione na 02.02.2027.');
  await form.getByRole('button', { name: 'Zapisz wykonanie', exact: true }).tap();
  await expect(form).toHaveCount(0);
  await expect(workspace.locator('[data-tab=active]')).toHaveAttribute('aria-pressed', 'true');
  await expect(workspace.locator('[data-tab=search]')).toHaveAttribute('aria-pressed', 'false');
  await expect(workspace.locator('.vb22-detail-title')).toHaveText('Fikcyjna sprawa mobilna A8 pierwsza');
  await expect(workspace.locator('.vb22-body')).toContainText('Fikcyjne MR umówione na 02.02.2027.');
  await expect(workspace.locator('.vb22-notice')).toContainText('Zapisano');
  await workspace.getByRole('button', { name: '← Lista spraw', exact: true }).tap();
  await expect(search).toHaveValue('Fikcyjna sprawa mobilna A8');
  await expect(workspace.locator('[data-filter=overdue]')).toHaveAttribute('aria-pressed', 'true');
  await expect(workspace.locator('.vb22-row:not(.vgs-row)')).toHaveCount(1);
  await expect(workspace.locator(`[data-note-id="${noteIds[1]}"]`)).toBeVisible();
  await workspace.locator('[data-tab=search]').tap();
  await workspace.getByRole('combobox', { name: 'Stan spraw', exact: true }).selectOption('completed');
  await expect(workspace.locator(`.vgs [data-search-id="note:${noteIds[0]}"]`)).toBeVisible();
  await expect(workspace.locator('[data-tab=search] .vb22-tab-count')).toHaveCount(0);
  expect(await workspace.locator('.vgs-list-pane').evaluate(node => getComputedStyle(node).backgroundColor)).toBe('rgb(255, 255, 255)');
});
