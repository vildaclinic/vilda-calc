import { expect, test } from '@playwright/test';
import { createFictionalVault } from '../support/centile-live-fixture.mjs';

test.use({ serviceWorkers: 'block', reducedMotion: 'reduce' });
test.setTimeout(120000);
const WORKSPACE = 'dialog.vb22-modal';

test('A8 Search discards a delayed pre-sync index, exposes a current read failure and recovers by read-only retry', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-10-29T10:00:00+01:00'));
  const { ids } = await createFictionalVault(page);
  const noteId = await page.evaluate(async patientId => {
    const vault = window.VildaVault;
    const saved = await vault.savePatientNote({ patientId, category: 'reminder-task',
      title: 'Fikcyjna zamknięta sprawa A8 po synchronizacji', body: 'Fikcyjne ustalenia.',
      dueDateISO: '2026-10-20', completedAtISO: '2026-10-21T09:00:00.000Z' });
    const allNotes = vault.listAllPatientNotes;
    window.__a8ReadErrorIndexCalls = 0; window.__a8ReadErrorFailedCalls = 0;
    vault.listAllPatientNotes = async function (...args) {
      window.__a8ReadErrorIndexCalls += 1;
      const call = window.__a8ReadErrorIndexCalls;
      const notes = await allNotes.apply(this, args);
      if (call === 1) await new Promise(resolve => { window.__a8ReadErrorRelease = resolve; });
      if (call === 2) { window.__a8ReadErrorFailedCalls += 1; throw new Error('FICTIONAL_SEARCH_INDEX_FAILURE_A8'); }
      return notes;
    };
    return saved.id;
  }, ids.a);
  await page.locator('#vildaRemindersBtn').click();
  const workspace = page.locator(WORKSPACE), searchTab = workspace.locator('[data-tab=search]');
  await searchTab.click();
  const global = workspace.locator('.vgs');
  const search = global.getByRole('searchbox', { name: 'Szukaj we wszystkich pacjentach i sprawach', exact: true });
  await search.fill('Fikcyjna zamknięta');
  await expect(searchTab).toHaveAttribute('aria-pressed', 'true');
  await expect(global).toHaveAttribute('aria-busy', 'true');
  await expect(search).toBeEnabled();
  await page.waitForFunction(() => typeof window.__a8ReadErrorRelease === 'function');
  await page.evaluate(() => document.dispatchEvent(new CustomEvent('vilda:sync-merged')));
  await expect(global.getByRole('alert')).toContainText('Nie udało się przeszukać danych.');
  await expect(global).toHaveAttribute('aria-busy', 'false');
  await expect(search).toBeEnabled();
  await expect(global.getByRole('status')).not.toHaveText('Wyszukiwanie…');
  await expect(searchTab).toHaveAttribute('aria-pressed', 'true');

  // Deliver the older successful read only after the new request has failed:
  // it must not clear the current error or insert stale results.
  await page.evaluate(() => window.__a8ReadErrorRelease());
  await expect(global.getByRole('alert')).toContainText('Nie udało się przeszukać danych.');
  await expect(global).toHaveAttribute('aria-busy', 'false');
  await expect(global.locator('.vgs-row')).toHaveCount(0);
  await global.getByRole('button', { name: 'Spróbuj ponownie', exact: true }).click();
  await expect(global.locator(`[data-search-id="note:${noteId}"]`)).toBeVisible();
  await expect(global.getByRole('alert')).toHaveCount(0);
  await expect(global).toHaveAttribute('aria-busy', 'false');
  await expect(search).toBeEnabled();
  expect(await page.evaluate(() => window.__a8ReadErrorFailedCalls)).toBe(1);
  expect(await page.evaluate(() => window.__a8ReadErrorIndexCalls)).toBe(3);
  const saved = await page.evaluate(id => window.VildaVault.getPatientNote(id), noteId);
  expect(saved.completedAtISO).toBe('2026-10-21T09:00:00.000Z');
  expect(saved.body).toBe('Fikcyjne ustalenia.');
});

test('A8 fast Back after a committed completion refreshes a new step due today', async ({ page }) => {
  await page.setViewportSize({ width: 393, height: 852 });
  await page.clock.setFixedTime(new Date('2026-10-29T10:00:00+01:00'));
  const { ids } = await createFictionalVault(page);
  const parentId = await page.evaluate(async patientId => {
    const vault = window.VildaVault;
    const parent = await vault.savePatientNote({ patientId, category: 'reminder-task',
      title: 'Fikcyjna sprawa Back A8', body: 'Fikcyjne pierwotne ustalenia.', dueDateISO: '2026-10-20' });
    await vault.savePatientNote({ patientId, category: 'reminder-task',
      title: 'Fikcyjna pozostała sprawa Back A8', dueDateISO: '2026-10-21' });
    const save = vault.saveReminderOutcome, due = vault.listPatientNotesDueByDate;
    window.__a8BackCommits = 0; window.__a8BackGroupsAfterCommit = 0;
    let committed = false, pauseFirst = true;
    vault.saveReminderOutcome = async function (...args) {
      const result = await save.apply(this, args);
      if (result.saved) { window.__a8BackCommits += 1; window.__a8BackNextId = result.nextId; committed = true; }
      return result;
    };
    vault.listPatientNotesDueByDate = async function (...args) {
      const groups = await due.apply(this, args);
      if (committed) {
        window.__a8BackGroupsAfterCommit += 1;
        if (pauseFirst) { pauseFirst = false; await new Promise(resolve => { window.__a8BackReleaseGroups = resolve; }); }
      }
      return groups;
    };
    return parent.id;
  }, ids.a);
  await page.locator('#vildaRemindersBtn').click();
  const workspace = page.locator(WORKSPACE);
  await workspace.locator(`[data-note-id="${parentId}"]`).click();
  await workspace.getByRole('button', { name: 'Oznacz jako wykonane', exact: true }).click();
  const outcome = page.locator('dialog.vb22-outcome');
  await outcome.getByLabel('Co zostało zrobione? (opcjonalnie)', { exact: true }).fill('Fikcyjny zapis wykonania Back A8.');
  await outcome.locator('.vb22-next-step > summary').click();
  await outcome.getByLabel('Kolejny krok', { exact: true }).fill('Fikcyjny kolejny krok A8 na dziś');
  await outcome.getByLabel('Termin kolejnego kroku', { exact: true }).fill('2026-10-29');
  await outcome.getByRole('button', { name: 'Zapisz wykonanie', exact: true }).click();
  await expect(outcome).toHaveCount(0);
  await page.waitForFunction(() => typeof window.__a8BackReleaseGroups === 'function');
  await workspace.getByRole('button', { name: '← Lista spraw', exact: true }).click();
  const nextId = await page.evaluate(() => window.__a8BackNextId);
  expect(nextId).toBeTruthy();
  // The first response is still paused: Back must start a fresh read of the changed list.
  await expect(workspace.locator(`[data-note-id="${nextId}"]`)).toBeVisible();
  await expect(workspace.locator(`[data-note-id="${parentId}"]`)).toHaveCount(0);
  await expect(workspace.locator('[data-tab=active]')).toHaveAttribute('aria-pressed', 'true');
  await expect(workspace.locator('[data-tab=search]')).toHaveAttribute('aria-pressed', 'false');
  expect(await page.evaluate(() => window.__a8BackGroupsAfterCommit)).toBeGreaterThanOrEqual(2);
  await page.evaluate(() => window.__a8BackReleaseGroups());
  await expect(workspace.locator(`[data-note-id="${nextId}"]`)).toBeVisible();
  await expect(workspace.locator(`[data-note-id="${parentId}"]`)).toHaveCount(0);
  expect(await page.evaluate(() => window.__a8BackCommits)).toBe(1);
});
