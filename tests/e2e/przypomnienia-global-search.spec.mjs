import { expect, test } from '@playwright/test';
import { clinicalFingerprint, loadPatient, readyForPatient, shellFrame } from '../support/centile-live-fixture.mjs';
import { GLOBAL_QUERY, SEARCH_WORKSPACE, globalSearchFixture, openGlobalSearch, queryGlobal, resultFor } from '../support/global-search-fixture.mjs';

test.use({ serviceWorkers: 'block', reducedMotion: 'reduce' });
test.setTimeout(180000);

async function assertShield(surface) {
  await expect(surface.locator('.vilda-reminders-private-cover')).toBeVisible();
  const protectedParts = surface.locator('.vb22-private-content');
  expect(await protectedParts.count()).toBeGreaterThan(0);
  expect(await protectedParts.evaluateAll(nodes => nodes.every(node => node.inert && node.getAttribute('aria-hidden') === 'true' && getComputedStyle(node).visibility === 'hidden'))).toBe(true);
}

test('Search covers all fictional patients, external people, future events, undated notes, descriptive results and care plans without changing the loaded patient', async ({ page }) => {
  const created = await globalSearchFixture(page);
  await loadPatient(created.frame, created.ids.a, 'restore');
  const before = await clinicalFingerprint(created.frame, created.ids.a);
  const search = await openGlobalSearch(page);
  await queryGlobal(search, 'NOWAK');
  await expect(search.locator('[data-search-id^="patient:"]')).toHaveCount(4);
  await expect(resultFor(search, 'patient', created.noMatters)).toBeVisible();
  await expect(resultFor(search, 'patient', created.external)).toBeVisible();
  await expect(resultFor(search, 'note', created.notes.external)).toBeVisible();
  await expect(resultFor(search, 'note', created.notes.undated)).toBeVisible();
  await expect(resultFor(search, 'plan', created.planId)).toBeVisible();

  await queryGlobal(search, 'biopsja');
  await expect(resultFor(search, 'note', created.notes.biopsy)).toBeVisible();
  await expect(resultFor(search, 'note', created.notes.narrative)).toBeVisible();
  await expect(resultFor(search, 'plan', created.planId)).toBeVisible();
  await search.getByRole('combobox', { name: 'Terminy spraw', exact: true }).selectOption('future');
  await expect(resultFor(search, 'note', created.notes.biopsy)).toBeVisible();
  await expect(resultFor(search, 'note', created.notes.narrative)).toHaveCount(0);
  await resultFor(search, 'note', created.notes.biopsy).click();
  await expect(search.locator('.vgs-detail')).toContainText('02.02.2027');
  await expect(search.locator('.vgs-detail')).toContainText('Fikcyjna przyszła procedura do organizacji.');

  await search.getByRole('combobox', { name: 'Terminy spraw', exact: true }).selectOption('all');
  await queryGlobal(search, 'REZONANS');
  await expect(resultFor(search, 'note', created.notes.mri)).toBeVisible();
  await expect(resultFor(search, 'note', created.notes.activity)).toBeVisible();
  await queryGlobal(search, 'zOLc');
  await expect(resultFor(search, 'patient', created.zolc)).toBeVisible();
  await queryGlobal(search, 'wykonany kontakt');
  await search.getByRole('combobox', { name: 'Stan spraw', exact: true }).selectOption('completed');
  await expect(resultFor(search, 'note', created.notes.completed)).toBeVisible();

  await search.getByRole('combobox', { name: 'Stan spraw', exact: true }).selectOption('all');
  await queryGlobal(search, 'znacznik tekstowy');
  await resultFor(search, 'note', created.notes.literal).click();
  await expect(search.locator('.vgs-detail .vb22-body')).toContainText('<img src=x onerror=');
  await expect(search.locator('img')).toHaveCount(0);
  expect(await page.evaluate(() => window.__fictionalSearchExecuted === true)).toBe(false);
  expect(await clinicalFingerprint(created.frame, created.ids.a)).toEqual(before);
});

test('Search uses the approved compact desktop toolbar and all three search fields keep their normal border when focused', async ({ page }) => {
  await globalSearchFixture(page);
  const search = await openGlobalSearch(page), workspace = page.locator(SEARCH_WORKSPACE);
  const query = search.getByRole('searchbox', { name: GLOBAL_QUERY, exact: true });
  const time = search.getByRole('combobox', { name: 'Terminy spraw', exact: true });
  const status = search.getByRole('combobox', { name: 'Stan spraw', exact: true });
  const boxes = await Promise.all([query.boundingBox(), time.boundingBox(), status.boundingBox()]);
  expect(Math.max(...boxes.map(box => box.y)) - Math.min(...boxes.map(box => box.y))).toBeLessThan(2);
  expect(boxes[0].x + boxes[0].width).toBeLessThanOrEqual(boxes[1].x);
  expect(boxes[1].x + boxes[1].width).toBeLessThanOrEqual(boxes[2].x);
  await expect(workspace).not.toContainText('Przeszukaj pacjentów, wydarzenia');
  await expect(workspace).not.toContainText('Pacjenci i sprawy, które chcesz mieć pod ręką.');
  await expect(search.getByRole('button', { name: 'Wszystko', exact: true })).toHaveCount(0);
  for (const [tab, selector] of [['search', '.vgs-query'], ['active', '.vb22-layout:not(.vgs-layout) .vb22-search'], ['plans', '.vcp-search']]) {
    await workspace.locator(`[data-tab=${tab}]`).click();
    const input = workspace.locator(selector); await expect(input).toBeVisible();
    const before = await input.evaluate(node => ({ border: getComputedStyle(node).border, shadow: getComputedStyle(node).boxShadow }));
    await input.click();
    expect(await input.evaluate(node => ({ border: getComputedStyle(node).border, shadow: getComputedStyle(node).boxShadow, outline: getComputedStyle(node).outlineStyle }))).toEqual({ ...before, outline: 'none' });
  }
  await expect(workspace).not.toContainText('Także przyszłe kroki i plany bez terminu.');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
});

test('the presentation eye masks inline and enlarged workspaces, survives rerender, refresh and shell navigation, and does not change patient state', async ({ page }) => {
  await page.addInitScript(() => {
    window.__fictionalPrivacyPaintLeaks = [];
    const scan = () => {
      if (localStorage.getItem('remindersPrivacyHidden') === 'true') {
        for (const node of document.querySelectorAll('.vb22-private-content')) {
          if (node.getClientRects().length && getComputedStyle(node).visibility !== 'hidden') window.__fictionalPrivacyPaintLeaks.push(node.className);
        }
      }
      requestAnimationFrame(scan);
    };
    requestAnimationFrame(scan);
  });
  const created = await globalSearchFixture(page, { shell: true });
  const frame = created.frame, card = frame.locator('#remindersInline .vb22-inline');
  await expect(card).toBeVisible();
  const fingerprint = await clinicalFingerprint(frame, created.ids.a);
  const geometry = await card.boundingBox();
  await card.getByRole('button', { name: 'Ukryj treść Przypomnień', exact: true }).click();
  await assertShield(card);
  const hiddenGeometry = await card.boundingBox();
  expect(hiddenGeometry.width).toBeCloseTo(geometry.width, 1); expect(hiddenGeometry.height).toBeCloseTo(geometry.height, 1);
  await card.hover(); await assertShield(card);
  await frame.evaluate(() => document.dispatchEvent(new CustomEvent('vilda:sync-merged')));
  await assertShield(card);
  await card.getByRole('button', { name: 'Powiększ Przypomnienia', exact: true }).click();
  const workspace = page.locator(SEARCH_WORKSPACE); await assertShield(workspace);
  await workspace.getByRole('button', { name: 'Pokaż treść Przypomnień', exact: true }).click();
  await workspace.locator('[data-tab=search]').click();
  const search = workspace.locator('.vgs'); await queryGlobal(search, 'Nowak');
  await expect(resultFor(search, 'patient', created.ids.a)).toBeVisible();
  await workspace.getByRole('button', { name: 'Ukryj treść Przypomnień', exact: true }).click();
  await assertShield(workspace);
  await expect(resultFor(search, 'patient', created.ids.a)).toBeHidden();
  expect(await clinicalFingerprint(frame, created.ids.a)).toEqual(fingerprint);
  expect(await page.evaluate(() => localStorage.getItem('remindersPrivacyHidden'))).toBe('true');
  await workspace.getByRole('button', { name: 'Zamknij Przypomnienia', exact: true }).click();
  await page.reload({ waitUntil: 'load' });
  const restored = await shellFrame(page); await readyForPatient(restored);
  await assertShield(restored.locator('#remindersInline .vb22-inline'));
  await page.evaluate(() => window.VildaShell.navigate('klirens'));
  await page.waitForFunction(() => [...document.querySelectorAll('iframe.app-pane')].some(node => node.contentWindow?.VildaRemindersPrivacy && /klirens/.test(node.src)));
  expect(await page.evaluate(() => [...document.querySelectorAll('iframe.app-pane')].filter(node => /klirens/.test(node.src)).every(node => node.contentDocument.documentElement.classList.contains('vilda-reminders-private')))).toBe(true);
  await page.locator('#vildaRemindersBtn').click();
  await assertShield(page.locator(SEARCH_WORKSPACE));
  const leaks = await page.evaluate(() => [window, ...[...document.querySelectorAll('iframe.app-pane')].map(node => node.contentWindow)].flatMap(owner => owner.__fictionalPrivacyPaintLeaks || []));
  expect(leaks).toEqual([]);
});

test('the eye protects independent outcome and care-plan dialogs while retaining their unsaved fictional drafts', async ({ page }) => {
  const created = await globalSearchFixture(page);
  await page.locator('#vildaRemindersBtn').click();
  const workspace = page.locator(SEARCH_WORKSPACE);
  // The completed task is deliberately reopened only inside this fictional vault
  // to provide a live action form; no write occurs when the shield is toggled.
  await page.evaluate(({ id, patientId }) => window.VildaVault.savePatientNote({ id, patientId, completedAtISO: null }), { id: created.notes.completed, patientId: created.ids.a });
  await workspace.locator(`[data-note-id="${created.notes.completed}"]`).click();
  await workspace.getByRole('button', { name: 'Oznacz jako wykonane', exact: true }).click();
  const outcome = page.locator('dialog.vb22-outcome');
  const text = outcome.getByLabel('Co zostało zrobione? (opcjonalnie)', { exact: true });
  await text.fill('Fikcyjny niezapisany szkic chroniony okiem.');
  const noteBefore = await page.evaluate(id => window.VildaVault.getPatientNote(id), created.notes.completed);
  await outcome.getByRole('button', { name: 'Ukryj treść Przypomnień', exact: true }).click();
  await assertShield(outcome); await expect(text).toBeHidden();
  await outcome.getByRole('button', { name: 'Pokaż treść Przypomnień', exact: true }).click();
  await expect(text).toHaveValue('Fikcyjny niezapisany szkic chroniony okiem.');
  expect(await page.evaluate(id => window.VildaVault.getPatientNote(id), created.notes.completed)).toEqual(noteBefore);
  await outcome.getByRole('button', { name: 'Anuluj', exact: true }).click();
  await workspace.locator('[data-tab=plans]').click();
  await workspace.getByRole('button', { name: 'Nowy plan opieki', exact: true }).click();
  const form = page.locator('dialog.vcp-dialog'), title = form.getByLabel('Nazwa planu', { exact: true });
  await title.fill('Fikcyjny niezapisany plan chroniony okiem.');
  const plansBefore = await page.evaluate(() => window.VildaVault.listCarePlans());
  await form.getByRole('button', { name: 'Ukryj treść Przypomnień', exact: true }).click();
  await assertShield(form); await expect(title).toBeHidden();
  await form.getByRole('button', { name: 'Pokaż treść Przypomnień', exact: true }).click();
  await expect(title).toHaveValue('Fikcyjny niezapisany plan chroniony okiem.');
  expect(await page.evaluate(() => window.VildaVault.listCarePlans())).toEqual(plansBefore);
});

test('Search caches decrypted reads between queries and invalidates live results after a saved or deleted fictional record', async ({ page }) => {
  const created = await globalSearchFixture(page);
  await page.evaluate(() => {
    const original = window.VildaVault.listAllPatientNotes;
    window.__fictionalSearchIndexReads = 0;
    window.VildaVault.listAllPatientNotes = function (...args) { window.__fictionalSearchIndexReads += 1; return original.apply(this, args); };
  });
  const search = await openGlobalSearch(page);
  await queryGlobal(search, 'Nowak'); await expect(resultFor(search, 'patient', created.ids.a)).toBeVisible();
  const firstReads = await page.evaluate(() => window.__fictionalSearchIndexReads);
  expect(firstReads).toBe(1);
  for (const [term, kind, id] of [['rezonans', 'note', created.notes.mri], ['Żółć', 'patient', created.zolc], ['biopsja', 'plan', created.planId]]) {
    await queryGlobal(search, term); await expect(resultFor(search, kind, id)).toBeVisible();
    expect(await page.evaluate(() => window.__fictionalSearchIndexReads)).toBe(firstReads);
  }
  await queryGlobal(search, 'rezonans'); await expect(search.locator('.vgs-row')).toHaveCount(2);
  const note = await page.evaluate(patientId => window.VildaVault.savePatientNote({
    patientId, title: 'Fikcyjny nowy rezonans po otwarciu wyszukiwarki', category: 'followup', dueDateISO: '2027-07-08',
  }), created.ids.a);
  await expect(resultFor(search, 'note', note.id)).toBeVisible();
  await expect(search.locator('.vgs-row')).toHaveCount(3);
  expect(await page.evaluate(() => window.__fictionalSearchIndexReads)).toBeGreaterThan(firstReads);
  await page.evaluate(id => window.VildaVault.removePatientNote(id), note.id);
  await expect(search.locator('.vgs-row')).toHaveCount(2);
  await expect(resultFor(search, 'note', note.id)).toHaveCount(0);
});
