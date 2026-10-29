import { expect, test } from '@playwright/test';
import { createFictionalVault } from '../support/centile-live-fixture.mjs';

test.use({ serviceWorkers: 'block', reducedMotion: 'reduce', isMobile: true, hasTouch: true });
test.setTimeout(120000);

const WORKSPACE = 'dialog.vb22-modal';
const OUTCOME = 'dialog.vb22-outcome';

async function seed(page, shell = false) {
  const created = await createFictionalVault(page, { shell });
  const ids = await created.frame.evaluate(async patients => {
    const date = new Date(); date.setDate(date.getDate() - 2);
    const dueDateISO = date.getFullYear() + '-' + String(date.getMonth() + 1).padStart(2, '0') + '-' + String(date.getDate()).padStart(2, '0');
    const notes = [];
    for (let index = 0; index < 26; index += 1) notes.push((await window.VildaVault.savePatientNote({
      patientId: patients.a, title: 'Fikcyjna nawigacja MR ' + String(index + 1).padStart(2, '0'),
      body: 'Fikcyjne ustalenia nawigacji. Wybrana sprawa ma pozostać niezmieniona po powrocie.',
      category: 'reminder-exam', dueDateISO, dueTime: '09:00',
    })).id);
    notes.push((await window.VildaVault.savePatientNote({
      patientId: patients.b, title: 'Fikcyjna nawigacja — wynik biopsji',
      body: 'Fikcyjne oczekiwanie na opis biopsji.', category: 'wynik-badania', dueDateISO, dueTime: '10:00',
    })).id);
    return notes;
  }, created.ids);
  await expect(page.locator('#vildaRemindersBtn')).toHaveAttribute('data-count', '27');
  return { ...created, noteIds: ids };
}

async function open(page) {
  await page.locator('#vildaRemindersBtn').tap();
  await expect(page.locator(WORKSPACE)).toBeVisible();
  await expect(page.locator(WORKSPACE)).toHaveCount(1);
}

async function listPage(page) {
  await expect(page.locator(`${WORKSPACE} .vb22-list-pane`)).toBeVisible();
  await expect(page.locator(`${WORKSPACE} .vb22-detail`)).toBeHidden();
}

async function detailPage(page, id) {
  await expect(page.locator(`${WORKSPACE} .vb22-list-pane`)).toBeHidden();
  await expect(page.locator(`${WORKSPACE} .vb22-detail`)).toBeVisible();
  await expect(page.locator(`${WORKSPACE} .vb22-back`)).toBeVisible();
  await expect(page.locator(`${WORKSPACE} .vb22-row[aria-current=true]`)).toHaveAttribute('data-note-id', id);
  await expect(page.locator(`${WORKSPACE} .vb22-detail .vb22-overdue`)).toHaveCount(0);
}

async function noPhoneExpander(page) {
  await expect(page.getByRole('button', { name: /Powiększ Przypomnienia/i })).toHaveCount(0);
  await expect(page.locator(`${WORKSPACE} [aria-label*="Powiększ"]`)).toHaveCount(0);
}

test('A7 touch navigation preserves filter, search, scroll and selection across detail, back and rotation in the shell', async ({ page }) => {
  await page.setViewportSize({ width: 393, height: 852 });
  await seed(page, true); await open(page); await listPage(page); await noPhoneExpander(page);
  expect(await page.evaluate(() => navigator.maxTouchPoints > 0 && matchMedia('(pointer:coarse)').matches)).toBe(true);

  const workspace = page.locator(WORKSPACE), pane = workspace.locator('.vb22-list');
  const search = workspace.getByRole('searchbox', { name: 'Szukaj pacjenta lub sprawy' });
  await workspace.locator('[data-filter=overdue]').tap();
  await search.fill('nawigacja MR');
  await expect(workspace.locator('.vb22-row')).toHaveCount(26);
  const listIds = await workspace.locator('.vb22-row').evaluateAll(nodes => nodes.map(node => node.dataset.noteId));
  const row = workspace.locator('.vb22-row').nth(18);
  await row.scrollIntoViewIfNeeded();
  const selectedId = await row.getAttribute('data-note-id');
  const scrollBefore = await pane.evaluate(node => node.scrollTop);
  expect(scrollBefore).toBeGreaterThan(0);
  await row.tap(); await detailPage(page, selectedId);

  const metadata = workspace.locator('.vb22-meta');
  const category = metadata.locator('.vb22-category');
  await expect(category).toHaveText('Badanie');
  const oneRow = await category.evaluate(node => {
    const date = node.parentElement.firstElementChild;
    const box = node.getBoundingClientRect(), dateBox = date.getBoundingClientRect(), line = node.parentElement.getBoundingClientRect();
    return Math.abs(box.top - dateBox.top) < 1 && Math.abs(box.right - line.right) < 1 && dateBox.right <= box.left;
  });
  expect(oneRow).toBe(true);
  const title = await workspace.locator('.vb22-detail-title').textContent();
  await workspace.getByRole('button', { name: 'Oznacz jako wykonane', exact: true }).tap();
  await expect(page.locator(OUTCOME)).toBeVisible();
  await page.locator(OUTCOME).getByLabel('Co zostało zrobione? (opcjonalnie)', { exact: true }).fill('Fikcyjny niezapisany szkic nawigacji.');
  await page.locator(OUTCOME).getByRole('button', { name: 'Anuluj', exact: true }).tap();
  await expect(page.locator(OUTCOME)).toHaveCount(0); await detailPage(page, selectedId);
  await expect(workspace.locator('.vb22-detail-title')).toHaveText(title);

  for (const viewport of [{ width: 852, height: 393 }, { width: 393, height: 480 }, { width: 393, height: 852 }]) {
    await page.setViewportSize(viewport); await detailPage(page, selectedId); await noPhoneExpander(page);
    await expect(workspace.locator('.vb22-detail-title')).toHaveText(title);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  }
  await workspace.locator('.vb22-back').tap(); await listPage(page);
  await expect(workspace.locator('[data-filter=overdue]')).toHaveAttribute('aria-pressed', 'true');
  await expect(search).toHaveValue('nawigacja MR');
  await expect(workspace.locator('.vb22-row[aria-current=true]')).toHaveAttribute('data-note-id', selectedId);
  expect(Math.abs(await pane.evaluate(node => node.scrollTop) - scrollBefore)).toBeLessThan(2);
  expect(await workspace.locator('.vb22-row[aria-current=true]').evaluate(node => document.activeElement === node)).toBe(true);
  await page.screenshot({ path: test.info().outputPath('a7-mobile-return-to-list.png') });

  for (const viewport of [{ width: 852, height: 393 }, { width: 393, height: 480 }, { width: 393, height: 852 }]) {
    await page.setViewportSize(viewport); await listPage(page); await noPhoneExpander(page);
  }
  // Saving closes the record while keeping the active view and its details.
  // Returning restores the list context and selects its nearest surviving row.
  await workspace.locator(`[data-note-id="${selectedId}"]`).tap(); await detailPage(page, selectedId);
  await workspace.getByRole('button', { name: 'Oznacz jako wykonane', exact: true }).tap();
  await page.locator(OUTCOME).getByRole('button', { name: 'Zapisz wykonanie', exact: true }).tap();
  await expect(page.locator(OUTCOME)).toHaveCount(0);
  await expect(workspace.locator('.vb22-detail-title')).toHaveText(title);
  await expect(workspace.locator('[data-tab=active]')).toHaveAttribute('aria-pressed', 'true');
  await expect(workspace.locator('[data-tab=history]')).toHaveAttribute('aria-pressed', 'false');
  await expect(workspace.locator('[data-filter=overdue]')).toHaveAttribute('aria-pressed', 'true');
  await expect(workspace.locator('.vb22-search')).toHaveValue('nawigacja MR');
  await workspace.locator('.vb22-back').tap(); await listPage(page);
  await expect(workspace.locator('[data-filter=overdue]')).toHaveAttribute('aria-pressed', 'true');
  await expect(search).toHaveValue('nawigacja MR');
  await expect(workspace.locator('.vb22-row')).toHaveCount(25);
  await expect(workspace.locator(`[data-note-id="${selectedId}"]`)).toHaveCount(0);
  const survivingIds = listIds.filter(id => id !== selectedId);
  const nearestId = survivingIds[Math.min(listIds.indexOf(selectedId), survivingIds.length - 1)];
  await expect(workspace.locator('.vb22-row[aria-current=true]')).toHaveAttribute('data-note-id', nearestId);
  await workspace.getByRole('button', { name: 'Zamknij Przypomnienia', exact: true }).tap();
  await expect(page.locator(WORKSPACE)).toHaveCount(0); await expect(page.locator(OUTCOME)).toHaveCount(0);
  expect(await page.evaluate(() => document.body.classList.contains('vilda-reminders-open'))).toBe(false);
});

test('A7 touch actions keep one workspace, return to the same details, and work in Start and DocPro', async ({ page, context }) => {
  await page.setViewportSize({ width: 393, height: 852 });
  const { noteIds } = await seed(page);
  for (const path of ['/index.html', '/docpro.html']) {
    if (path === '/docpro.html') {
      await page.goto(path); await page.waitForFunction(() => window.VildaVault?.isUnlocked() && window.VildaAuthUI);
      const confirm = page.locator('#professionalConfirmBtn'); if (await confirm.isVisible()) await confirm.tap();
    }
    await open(page); await listPage(page); await noPhoneExpander(page);
    const workspace = page.locator(WORKSPACE);
    const scenarios = [
      [noteIds[0], 'Oznacz jako wykonane', 'Co zostało zrobione? (opcjonalnie)'],
      [noteIds.at(-1), 'Dodaj wynik do kartoteki', 'Opis otrzymanego wyniku'],
      [noteIds[1], 'Przełóż termin', 'Powód zmiany (opcjonalnie)'],
    ];
    for (const [id, label, field] of scenarios) {
      await workspace.locator(`[data-note-id="${id}"]`).tap(); await detailPage(page, id);
      expect(await workspace.locator('.vb22-meta .vb22-category').evaluate(node => {
        const date = node.parentElement.firstElementChild;
        const typeBox = node.getBoundingClientRect(), dateBox = date.getBoundingClientRect(), line = node.parentElement.getBoundingClientRect();
        return Math.abs(typeBox.top - dateBox.top) < 1 && Math.abs(typeBox.right - line.right) < 1 && dateBox.right <= typeBox.left;
      })).toBe(true);
      await workspace.getByRole('button', { name: label, exact: true }).tap();
      await expect(page.locator(OUTCOME)).toBeVisible(); await expect(page.locator(WORKSPACE)).toHaveCount(1);
      await expect(page.locator(OUTCOME).getByLabel(field, { exact: true })).toBeVisible();
      expect(context.pages()).toHaveLength(1);
      await page.locator(OUTCOME).getByRole('button', { name: 'Anuluj', exact: true }).tap();
      await expect(page.locator(OUTCOME)).toHaveCount(0); await detailPage(page, id);
      await workspace.locator('.vb22-back').tap(); await listPage(page);
    }
    await page.screenshot({ path: test.info().outputPath(path.includes('docpro') ? 'a7-mobile-docpro-list.png' : 'a7-mobile-start-list.png') });
    await workspace.locator(`[data-note-id="${noteIds[0]}"]`).tap(); await detailPage(page, noteIds[0]);
    await workspace.getByRole('button', { name: 'Zamknij Przypomnienia', exact: true }).tap();
    await expect(page.locator('dialog.vb22')).toHaveCount(0);
    await expect(page.getByRole('button', { name: /Powiększ Przypomnienia/i })).toHaveCount(0);
  }
});
