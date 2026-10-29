import { expect, test } from '@playwright/test';
import { createFictionalVault, readyForPatient, shellFrame } from '../support/centile-live-fixture.mjs';

test.use({ serviceWorkers: 'block', reducedMotion: 'reduce', viewport: { width: 1440, height: 1000 } });
test.setTimeout(180000);

const WORKSPACE = 'dialog.vb22-modal';
const SEARCH = 'Szukaj pacjenta lub sprawy';

async function seed(page, { shell = false, active = 35, history = 62 } = {}) {
  await page.clock.setFixedTime(new Date('2026-10-29T10:00:00+01:00'));
  await page.route('**/*', route => {
    const url = route.request().url();
    return url.startsWith('http://127.0.0.1:') || url.startsWith('data:') || url.startsWith('blob:') ? route.continue() : route.abort();
  });
  const created = await createFictionalVault(page, { shell });
  const notes = await created.frame.evaluate(async ({ patientId, active, history }) => {
    const notes = { active: [], history: [] };
    for (const [kind, count] of [['active', active], ['history', history]]) {
      for (let index = 0; index < count; index += 1) {
        const title = 'Fikcyjna ' + (kind === 'active' ? 'czynna' : 'historia') + ' A9 ' + String(index).padStart(3, '0');
        const record = await window.VildaVault.savePatientNote({
          patientId, title, body: 'Fikcyjna treść przypomnienia A9.', category: 'reminder-task',
          dueDateISO: '2026-10-20', dueTime: '09:00',
          completedAtISO: kind === 'history' ? '2026-10-21T09:00:00.000Z' : null,
        });
        notes[kind].push({ id: record.id, title });
      }
    }
    return notes;
  }, { patientId: created.ids.a, active, history });
  const consent = page.locator('#consent-decline'); if (await consent.isVisible()) await consent.click();
  return { ...created, notes };
}

async function hittable(control) {
  return control.evaluate(node => {
    const rect = node.getBoundingClientRect();
    const target = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
    return { width: rect.width, height: rect.height, top: rect.top, bottom: rect.bottom,
      inViewport: rect.top >= 0 && rect.bottom <= innerHeight + 1 && rect.left >= 0 && rect.right <= innerWidth + 1,
      hit: target === node || node.contains(target) };
  });
}

async function openFull(page) {
  await page.locator('#vildaRemindersBtn').click();
  const workspace = page.locator(WORKSPACE); await expect(workspace).toBeVisible(); return workspace;
}

test('A9 actual desktop inline headers survive embedded-page styles and History searches beyond the first page', async ({ page }) => {
  const created = await seed(page);
  for (const embedded of [false, true]) {
    let frame = page;
    if (embedded) {
      await page.goto('/app.html#/start'); frame = await shellFrame(page); await readyForPatient(frame);
      await expect(page.locator('body > header')).toBeVisible();
      expect((await page.locator('body > header').boundingBox()).height).toBeGreaterThan(40);
      await expect(frame.locator('body > header')).toBeHidden();
    }
    const card = frame.locator('#remindersInline');
    await expect(card.locator('.vb22-row')).toHaveCount(created.notes.active.length);
    const inputBox = await frame.locator('#userSection').boundingBox(), cardBox = await card.boundingBox();
    expect(cardBox.x, 'the reminder card is in the real second column').toBeGreaterThan(inputBox.x + inputBox.width - 2);
    const heading = card.locator('.vb22-head h2'), tabs = card.locator('.vb22-tabs');
    await expect(heading).toHaveText('Przypomnienia'); await expect(heading).toBeVisible();
    const headingBox = await heading.boundingBox(), tabsBox = await tabs.boundingBox();
    expect(headingBox.height).toBeGreaterThan(15); expect(headingBox.y).toBeGreaterThanOrEqual(cardBox.y);
    expect(headingBox.y + headingBox.height).toBeLessThanOrEqual(tabsBox.y + 1);
    for (const name of ['Dodaj przypomnienie', 'Powiększ Przypomnienia']) {
      const hit = await hittable(card.getByRole('button', { name, exact: true }));
      expect(hit.inViewport).toBe(true); expect(hit.hit).toBe(true);
    }
    await card.locator('[data-tab=history]').click(); await expect(card.locator('.vb22-row')).toHaveCount(50);
    const visible = new Set(await card.locator('[data-note-id]').evaluateAll(nodes => nodes.map(node => node.dataset.noteId)));
    const beyondFirstPage = created.notes.history.find(note => !visible.has(note.id)); expect(beyondFirstPage).toBeTruthy();
    const search = card.getByRole('searchbox', { name: SEARCH, exact: true }); await expect(search).toBeVisible();
    await search.fill(beyondFirstPage.title);
    await expect(card.locator('.vb22-row')).toHaveCount(1);
    await expect(card.locator(`[data-note-id="${beyondFirstPage.id}"]`)).toBeVisible();
    await card.getByRole('button', { name: 'Powiększ Przypomnienia', exact: true }).click();
    await expect(page.locator(WORKSPACE)).toBeVisible();
    await expect(page.locator(WORKSPACE).locator('[data-tab=history]')).toHaveAttribute('aria-pressed', 'true');
    await page.locator(WORKSPACE).getByRole('button', { name: 'Zamknij Przypomnienia', exact: true }).click();
    await expect(heading).toBeVisible();
  }
});

test('A9 full desktop search stays fixed while the active and historical lists scroll in index, DocPro and the shell', async ({ page }) => {
  const created = await seed(page);
  for (const route of ['/index.html', '/docpro.html', '/app.html#/start']) {
    if (route !== '/index.html') await page.goto(route);
    const frame = route.includes('app.html') ? await shellFrame(page) : page;
    await frame.waitForFunction(() => window.VildaVault?.isUnlocked() && window.VildaAuthUI);
    if (route === '/docpro.html') {
      const confirmation = page.locator('#professionalConfirmBtn'); if (await confirmation.isVisible()) await confirmation.click();
    }
    const workspace = await openFull(page);
    for (const [tab, count] of [['active', created.notes.active.length], ['history', 50]]) {
      await workspace.locator(`[data-tab=${tab}]`).click(); await expect(workspace.locator('.vb22-row')).toHaveCount(count);
      const search = workspace.getByRole('searchbox', { name: SEARCH, exact: true });
      const list = workspace.locator('.vb22-list'), pane = workspace.locator('.vb22-list-pane');
      const before = await search.boundingBox();
      await list.hover(); await page.mouse.wheel(0, 1400);
      await expect.poll(() => list.evaluate(node => node.scrollTop)).toBeGreaterThan(100);
      const after = await search.boundingBox();
      expect(Math.abs(after.y - before.y), route + ' ' + tab + ': search does not travel with rows').toBeLessThan(1);
      expect(await pane.evaluate(node => node.scrollTop)).toBe(0);
      const hit = await hittable(search); expect(hit.inViewport).toBe(true); expect(hit.hit).toBe(true);
      expect(await list.evaluate(node => node.scrollHeight > node.clientHeight)).toBe(true);
    }
    await workspace.getByRole('button', { name: 'Zamknij Przypomnienia', exact: true }).click();
  }
});

test('A9 the add form has a reachable sticky cancel cross and both cancellation controls preserve the same event and record', async ({ page }) => {
  const created = await seed(page, { shell: true, active: 4, history: 0 });
  const original = created.notes.active[0];
  await created.frame.evaluate(async id => {
    const note = await window.VildaVault.getPatientNote(id);
    await window.VildaVault.savePatientNote({
      ...note, body: 'Fikcyjny długi opis poprzednio wybranego przypomnienia.\n'.repeat(25),
    });
  }, original.id);
  const workspace = await openFull(page);
  await workspace.locator('[data-filter=overdue]').click();
  await workspace.getByRole('searchbox', { name: SEARCH, exact: true }).fill(original.title);
  await workspace.locator(`[data-note-id="${original.id}"]`).click();
  const before = await created.frame.evaluate(id => window.VildaVault.listPatientNotesForPatient(id), created.ids.a);
  await workspace.getByRole('button', { name: 'Oznacz jako wykonane', exact: true }).click();
  const outcome = page.locator('dialog.vb22-outcome');
  await expect(outcome.locator('.vb22-outcome-head')).toBeVisible();
  const outcomeHeading = outcome.locator('.vb22-outcome-head h2');
  await expect(outcomeHeading).toHaveText('Oznacz jako wykonane');
  expect((await outcomeHeading.boundingBox()).height).toBeGreaterThan(15);
  const outcomeClose = await hittable(outcome.getByRole('button', { name: 'Zamknij formularz', exact: true }));
  expect(outcomeClose.inViewport).toBe(true); expect(outcomeClose.hit).toBe(true);
  await outcome.getByRole('button', { name: 'Zamknij formularz', exact: true }).click();
  await expect(outcome).toHaveCount(0);
  await page.setViewportSize({ width: 1440, height: 520 });
  for (const cancelWithCross of [true, false]) {
    await workspace.locator('.vb22-detail').evaluate(node => { node.scrollTop = node.scrollHeight; });
    expect(await workspace.locator('.vb22-detail').evaluate(node => node.scrollTop)).toBeGreaterThan(0);
    await workspace.getByRole('button', { name: 'Dodaj przypomnienie', exact: true }).click();
    const form = workspace.locator('.vb22-detail > .vb22-form'); await expect(form).toBeVisible();
    const patientSearch = form.getByRole('searchbox', { name: 'Szukaj pacjenta', exact: true });
    const headBox = await form.locator('.vb22-form-head').boundingBox(), searchBox = await patientSearch.boundingBox();
    expect(searchBox.y, 'opening the form exposes the first field below the sticky heading').toBeGreaterThanOrEqual(headBox.y + headBox.height - 1);
    const patientSearchHit = await hittable(patientSearch);
    expect(patientSearchHit.inViewport).toBe(true); expect(patientSearchHit.hit).toBe(true);
    await patientSearch.fill('Fikcyjny Antoni');
    await form.locator(`.vb22-patient-option[data-patient-id="${created.ids.a}"]`).click();
    await form.getByLabel('Treść przypomnienia', { exact: true }).fill('Fikcyjny niezapisany szkic A9');
    await form.getByLabel('Dodatkowe informacje (opcjonalnie)', { exact: true }).fill('Fikcyjny dodatkowy opis.\n'.repeat(20));
    const cross = form.getByRole('button', { name: 'Anuluj dodawanie przypomnienia', exact: true });
    await form.getByRole('button', { name: 'Anuluj', exact: true }).scrollIntoViewIfNeeded();
    expect(await workspace.locator('.vb22-detail').evaluate(node => node.scrollTop)).toBeGreaterThan(0);
    const hit = await hittable(cross);
    expect(hit.height).toBeGreaterThanOrEqual(44); expect(hit.inViewport).toBe(true); expect(hit.hit).toBe(true);
    if (cancelWithCross) await cross.click(); else await form.getByRole('button', { name: 'Anuluj', exact: true }).click();
    await expect(form).toHaveCount(0); await expect(workspace).toBeVisible();
    await expect(workspace.locator('.vb22-detail-title')).toHaveText(original.title);
    await expect(workspace.locator('[data-filter=overdue]')).toHaveAttribute('aria-pressed', 'true');
    await expect(workspace.getByRole('searchbox', { name: SEARCH, exact: true })).toHaveValue(original.title);
    expect(await created.frame.evaluate(id => window.VildaVault.listPatientNotesForPatient(id), created.ids.a)).toEqual(before);
  }
});
