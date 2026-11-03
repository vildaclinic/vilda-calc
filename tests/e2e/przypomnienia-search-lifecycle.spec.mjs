import { devices, expect, test } from '@playwright/test';
import { writeFile } from 'node:fs/promises';
import { mutatePlan } from '../support/care-plans-fixture.mjs';
import { GLOBAL_QUERY, openGlobalSearch, queryGlobal, resultFor } from '../support/global-search-fixture.mjs';
import { RETURN_TO_SEARCH, actualGhControl, assertSearchContext, contextAtAction } from '../support/search-return-browser-fixture.mjs';
import { SEARCH_READ_ERROR, assertMissingSearch, beginClinicalReadProof, calendarFrame, changeNote, corruptFictionalCipher,
  fullLongSearch, lifecycleFixture, renameExternal, renamePrimary, representativeKlirens, restoreFictionalCipher, storedFingerprint, strictReadCounter } from '../support/search-lifecycle-browser-fixture.mjs';

test.use({ launchOptions: {
  ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH } : {}),
  args: ['--disable-features=BackForwardCache', '--no-sandbox'],
} });
const profiles = [
  ['desktop 1440', { viewport: { width: 1440, height: 1000 } }],
  ['phone 390', { viewport: { width: 390, height: 852 }, isMobile: true, hasTouch: true,
    userAgent: devices['iPhone 15 Pro'].userAgent, deviceScaleFactor: devices['iPhone 15 Pro'].deviceScaleFactor }],
];
const closeWorkspace = search => search.locator('xpath=ancestor::dialog').getByRole('button', { name: 'Zamknij Przypomnienia', exact: true }).click();

async function choose(search, kind, id) {
  await expect(resultFor(search, kind, id)).toHaveCount(1);
  if (await search.evaluate(node => node.classList.contains('vgs-show-detail')) && await search.locator('.vgs-back').isVisible()) {
    await search.getByRole('button', { name: '← Wyniki wyszukiwania', exact: true }).click();
  }
  await resultFor(search, kind, id).click();
}

for (const [profile, settings] of profiles) test.describe(profile, () => {
  test.use({ ...settings, serviceWorkers: 'block', reducedMotion: 'reduce', actionTimeout: 15000, navigationTimeout: 30000 });
  test.setTimeout(240000);
  test.afterEach(async ({ page }) => {
    for (const frame of page.frames()) {
      const geometry = await frame.evaluate(() => {
        if (window.frameElement?.hidden) return null;
        return { width: innerWidth, scrollWidth: document.documentElement.scrollWidth };
      });
      if (geometry) expect(geometry.scrollWidth, 'the visible desktop/mobile document has no horizontal overflow').toBeLessThanOrEqual(geometry.width + 1);
    }
  });

  test('one local write loads one fresh generation, and another window updates status and deletion without stale results', async ({ page }) => {
    const created = await lifecycleFixture(page);
    const reads = await strictReadCounter(page);
    const search = await openGlobalSearch(page);
    await queryGlobal(search, 'badanie ambulatoryjne');
    await choose(search, 'note', created.notes.biopsy);
    const originalReads = await reads();
    const updated = await changeNote(page, created.notes.biopsy, { body: 'Fikcyjny nowy lokalny znacznik wyszukiwarki.' });
    const afterLocalWrite = await storedFingerprint(created.writer);
    await expect(search.locator('.vb22-body')).toHaveText(updated.body);
    // Local hooks, AuthUI.changed and the native BC/storage transports all
    // announce the same production write. They must share one index load.
    await page.waitForTimeout(350);
    expect(await reads() - originalReads).toBe(1);
    await queryGlobal(search, 'nowy lokalny znacznik');
    await expect(resultFor(search, 'note', created.notes.biopsy)).toHaveCount(1);
    expect(await reads() - originalReads).toBe(1);
    expect(await storedFingerprint(page)).toBe(afterLocalWrite);

    await search.getByRole('combobox', { name: 'Stan spraw', exact: true }).selectOption('open');
    await choose(search, 'note', created.notes.biopsy);
    await created.writer.evaluate(id => window.VildaVault.completePatientNote(id), created.notes.biopsy);
    await assertMissingSearch(search, { query: 'nowy lokalny znacznik', time: 'all', status: 'open', count: 0 });
    await search.getByRole('combobox', { name: 'Stan spraw', exact: true }).selectOption('completed');
    await choose(search, 'note', created.notes.biopsy);
    await expect(search.locator('.vgs-status')).toContainText('Zakończone');
    await expect(search.locator('.vb22-body')).toHaveText(updated.body);
    await created.writer.evaluate(id => window.VildaVault.removePatientNote(id), created.notes.biopsy);
    const afterDelete = await storedFingerprint(created.writer);
    await assertMissingSearch(search, { query: 'nowy lokalny znacznik', time: 'all', status: 'completed', count: 0 });
    expect(await storedFingerprint(page)).toBe(afterDelete);
  });

  test('another window renames primary and external patients, edits the real plan and removes both records from the index', async ({ page }) => {
    const created = await lifecycleFixture(page);
    await renamePrimary(created.writer, created.ids.a, 'PierwotnyIndeks');
    await renameExternal(created.writer, created.external, 'ZewnętrznyPierwotny');
    const search = await openGlobalSearch(page);
    await queryGlobal(search, 'PierwotnyIndeks');
    await choose(search, 'patient', created.ids.a);
    await renamePrimary(created.writer, created.ids.a, 'NowyIndeks');
    await expect(search.locator('.vgs-row')).toHaveCount(0);
    await queryGlobal(search, 'NowyIndeks');
    await choose(search, 'patient', created.ids.a);
    await expect(search.locator('.vb22-patient-link')).toContainText('NowyIndeks');

    await queryGlobal(search, 'ZewnętrznyPierwotny');
    await choose(search, 'patient', created.external);
    await renameExternal(created.writer, created.external, 'ZewnętrznyAktualny');
    await expect(search.locator('.vgs-row')).toHaveCount(0);
    await queryGlobal(search, 'ZewnętrznyAktualny');
    await choose(search, 'patient', created.external);
    await expect(search.locator('.vb22-patient-link')).toContainText('ZewnętrznyAktualny');

    await queryGlobal(search, 'plan dalszego postępowania');
    await choose(search, 'plan', created.planId);
    await mutatePlan(created.writer, created.ids.a, created.planId, 'edit', {
      title: 'Fikcyjny aktualny plan indeksu', goal: 'Fikcyjny nowy znacznik planu po zmianie w drugim oknie.',
    });
    await expect(search.locator('.vgs-row')).toHaveCount(0);
    await queryGlobal(search, 'nowy znacznik planu');
    await choose(search, 'plan', created.planId);
    await expect(search.locator('.vgs-title')).toHaveText('Fikcyjny aktualny plan indeksu');
    await created.writer.evaluate(id => window.VildaVault.removePatient(id), created.ids.a);
    await assertMissingSearch(search, { query: 'nowy znacznik planu', time: 'all', status: 'all', count: 0 });
    await queryGlobal(search, 'NowyIndeks');
    await expect(search.locator('.vgs-row')).toHaveCount(0);

    await queryGlobal(search, 'ZewnętrznyAktualny');
    await choose(search, 'patient', created.external);
    await created.writer.evaluate(id => window.VildaVault.removePatient(id), created.external);
    const afterDelete = await storedFingerprint(created.writer);
    await assertMissingSearch(search, { query: 'ZewnętrznyAktualny', time: 'all', status: 'all', count: 0 });
    expect(await storedFingerprint(page)).toBe(afterDelete);
  });

  for (const shell of [false, true]) test(`external changes while patient and Calendar are open preserve the 81st result context (shell=${shell})`, async ({ page }) => {
    await page.addInitScript(() => { window.__lifecycleDocumentId = crypto.randomUUID(); });
    const created = await lifecycleFixture(page, { shell, long: true });
    let { search } = await fullLongSearch(page, created);
    const id = created.longNotes[80];
    let action = search.getByRole('button', { name: 'Otwórz w karcie pacjenta ↗', exact: true });
    const beforePatient = await contextAtAction(search, action);
    await action.click();
    const card = page.locator('.vilda-auth-patient-card');
    await expect(card).toBeVisible();
    const note = await created.writer.evaluate(id => window.VildaVault.getPatientNote(id), id);
    await changeNote(created.writer, id, { body: note.body + '\n\nFikcyjna aktualizacja z drugiego okna podczas otwartej karty.' });
    const afterEdit = await storedFingerprint(created.writer);
    await card.getByRole('button', { name: RETURN_TO_SEARCH, exact: true }).click();
    search = await assertSearchContext(page, beforePatient);
    await expect(search.locator('.vb22-body')).toContainText('Fikcyjna aktualizacja z drugiego okna');
    expect(await storedFingerprint(page)).toBe(afterEdit);

    action = search.getByRole('button', { name: 'Otwórz w Terminarzu ↗', exact: true });
    const beforeCalendar = await contextAtAction(search, action);
    const documentId = await page.evaluate(() => window.__lifecycleDocumentId);
    await action.click();
    const calendar = await calendarFrame(page, shell);
    await expect(calendar.locator(`#terminarzRoot [data-note-id="${id}"][aria-current="true"]`)).toBeVisible();
    if (!shell) expect(await page.evaluate(() => window.__lifecycleDocumentId)).not.toBe(documentId);
    await created.writer.evaluate(id => window.VildaVault.removePatientNote(id), id);
    const afterDelete = await storedFingerprint(created.writer);
    await calendar.getByRole('button', { name: RETURN_TO_SEARCH, exact: true }).click();
    search = page.locator('dialog.vb22-modal .vgs');
    await assertMissingSearch(search, { ...beforeCalendar, count: 95 });
    expect(await storedFingerprint(page)).toBe(afterDelete);
  });

  test('a real corrupt encrypted note rejects the complete index and retry rereads the restored ciphertext', async ({ page }) => {
    const created = await lifecycleFixture(page);
    const before = await storedFingerprint(created.writer);
    await corruptFictionalCipher(created.writer, created.notes.biopsy);
    const search = await openGlobalSearch(page);
    await queryGlobal(search, 'Fikcyjny');
    await expect(search.getByRole('alert')).toContainText(SEARCH_READ_ERROR);
    await expect(search.locator('.vgs-row')).toHaveCount(0);
    await restoreFictionalCipher(created.writer);
    await search.getByRole('button', { name: 'Spróbuj ponownie', exact: true }).click();
    await expect(search.getByRole('alert')).toHaveCount(0);
    await choose(search, 'note', created.notes.biopsy);
    await expect(search.locator('.vb22-body')).toHaveText('Fikcyjna przyszła procedura do organizacji.');
    expect(await storedFingerprint(page)).toBe(before);
  });

  test('new real Klirens producer families and the real DocPro monitor enter the live index without starting reader-side clinical engines', async ({ page }) => {
    const created = await lifecycleFixture(page);
    const verifyClinicalRead = await beginClinicalReadProof(page);
    const search = await openGlobalSearch(page);
    await queryGlobal(search, 'Fikcyjny lifecycle wynik');
    await expect(search.locator('.vgs-row')).toHaveCount(0);
    const cases = representativeKlirens(created.ids.a);
    const saved = await created.writer.evaluate(async cases => {
      const result = [];
      for (const entry of cases) result.push({ key: entry.key, id: (await window.VildaVault.savePatientNote(entry.notePayload)).id });
      return result;
    }, cases.map(({ key, notePayload }) => ({ key, notePayload })));
    await expect(search.locator('.vgs-row')).toHaveCount(cases.length);
    for (const entry of cases) {
      await choose(search, 'note', saved.find(note => note.key === entry.key).id);
      await expect(search.locator('.vb22-body')).toHaveText(entry.expected.summary);
    }
    const gh = await actualGhControl(created.writer, { ...created, frame: created.writer });
    await queryGlobal(search, 'leczenie rhGH');
    await choose(search, 'note', gh.note.id);
    const beforeReads = await storedFingerprint(created.writer);
    await expect(search.locator('.vb22-body')).toContainText('Kontrola leczenia hormonem wzrostu');
    expect(await storedFingerprint(page)).toBe(beforeReads);
    await verifyClinicalRead();
  });

  test('waking after local midnight refilters the cached index without decrypting a new generation', async ({ page }) => {
    const created = await lifecycleFixture(page);
    const notes = await created.writer.evaluate(async patientId => {
      const result = [];
      for (const day of ['2026-10-29', '2026-10-30']) result.push((await window.VildaVault.savePatientNote({
        patientId, title: 'Fikcyjna granica lokalnej doby ' + day, category: 'followup', dueDateISO: day,
        body: 'Fikcyjny termin do sprawdzenia zakresu dat.',
      })).id);
      return result;
    }, created.ids.a);
    const reads = await strictReadCounter(page);
    const search = await openGlobalSearch(page);
    await queryGlobal(search, 'granica lokalnej doby');
    await search.getByRole('combobox', { name: 'Daty wpisów', exact: true }).selectOption('today');
    await expect(resultFor(search, 'note', notes[0])).toHaveCount(1);
    await expect(resultFor(search, 'note', notes[1])).toHaveCount(0);
    const baselineReads = await reads(), before = await storedFingerprint(created.writer);
    await page.clock.setFixedTime(new Date('2026-10-30T00:00:01+01:00'));
    await page.evaluate(() => window.dispatchEvent(new Event('focus')));
    await expect(resultFor(search, 'note', notes[0])).toHaveCount(0);
    await expect(resultFor(search, 'note', notes[1])).toHaveCount(1);
    expect(await reads()).toBe(baselineReads);
    await expect(search.getByRole('searchbox', { name: GLOBAL_QUERY, exact: true })).toHaveValue('granica lokalnej doby');
    expect(await storedFingerprint(page)).toBe(before);
    await closeWorkspace(search);
  });
});

test.describe('desktop retained inline Search', () => {
  // A shorter real window exercises document scrolling as well as the
  // independent result list, without spacer content.
  test.use({ viewport: { width: 1440, height: 600 }, serviceWorkers: 'block', reducedMotion: 'reduce', actionTimeout: 15000, navigationTimeout: 30000 });
  test.setTimeout(180000);

  test('a hidden shell iframe preserves its query, expanded list and scroll without reading until shown again', async ({ page }) => {
    const created = await lifecycleFixture(page, { shell: true, long: true });
    await page.bringToFront();
    // Finish the existing main-form compatibility refresh before measuring
    // these four actual index sources, rather than unrelated startup work.
    await page.waitForTimeout(4500);
    await created.frame.evaluate(() => {
      const names = ['listPatients', 'listExternalPatients', 'listAllPatientNotes', 'listCarePlans'];
      window.__lifecycleInline = { reads: Object.fromEntries(names.map(name => [name, 0])), destroyed: 0, destroyStacks: [] };
      for (const name of names) {
        const original = window.VildaVault[name];
        window.VildaVault[name] = function (...args) {
          window.__lifecycleInline.reads[name] += 1;
          return original.apply(this, args);
        };
      }
      const originalCreate = window.VildaGlobalSearch.create;
      window.VildaGlobalSearch.create = function (...args) {
        const service = originalCreate.apply(this, args), originalDestroy = service.destroy;
        window.__lifecycleInline.service = service;
        service.destroy = function (...values) {
          window.__lifecycleInline.destroyed += 1;
          window.__lifecycleInline.destroyStacks.push(new Error('Search service destroyed').stack);
          return originalDestroy.apply(this, values);
        };
        return service;
      };
    });
    const inline = created.frame.locator('#remindersInline .vb22-inline');
    await expect(inline).toBeVisible();
    await inline.locator('[data-tab=search]').click();
    const search = inline.locator('.vgs');
    await queryGlobal(search, 'Nowak');
    await search.locator('.vgs-more').click();
    await expect(search.locator('.vgs-row')).toHaveCount(100);
    await search.locator('.vgs-row').nth(80).scrollIntoViewIfNeeded();
    await expect.poll(() => search.locator('.vgs-list').evaluate(node => node.scrollTop)).toBeGreaterThan(100);
    await created.frame.evaluate(() => window.scrollTo({ top: 320, behavior: 'instant' }));
    await expect.poll(() => created.frame.evaluate(() => window.scrollY)).toBeGreaterThan(100);
    await created.frame.evaluate(() => new Promise(resolve => { requestAnimationFrame(() => requestAnimationFrame(resolve)); }));
    const before = await search.evaluate(node => ({
      query: node.querySelector('.vgs-query').value, count: node.querySelectorAll('.vgs-row').length,
      scroll: node.querySelector('.vgs-list').scrollTop, documentScroll: node.ownerDocument.defaultView.scrollY,
    }));
    const readState = () => created.frame.evaluate(() => ({ ...window.__lifecycleInline.reads }));
    expect(await readState()).toEqual({ listPatients: 1, listExternalPatients: 1, listAllPatientNotes: 1, listCarePlans: 1 });

    await page.evaluate(() => window.VildaShell.navigate('homa'));
    await expect(page.locator('iframe.app-pane[title="Start"]')).toBeHidden();
    expect(await created.frame.evaluate(() => ({ frameHidden: window.frameElement.hidden, documentHidden: document.hidden }))).toEqual({ frameHidden: true, documentHidden: false });
    const note = await created.writer.evaluate(id => window.VildaVault.getPatientNote(id), created.longNotes[80]);
    await changeNote(created.writer, note.id, { body: note.body + '\n\nFikcyjny ukryty znacznik indeksu.' });
    const afterWrite = await storedFingerprint(created.writer);
    // Native BC/storage delivery is intentionally real; no service.invalidate
    // call substitutes for the change arriving from the other browser window.
    await page.waitForTimeout(650);
    expect(await readState()).toEqual({ listPatients: 1, listExternalPatients: 1, listAllPatientNotes: 1, listCarePlans: 1 });
    expect(await created.frame.evaluate(() => window.__lifecycleInline.destroyStacks)).toEqual([]);
    await expect(search.locator('.vgs-query')).toHaveValue(before.query);

    await page.evaluate(() => window.VildaShell.navigate('start'));
    await expect(inline).toBeVisible();
    await expect.poll(readState).toEqual({ listPatients: 2, listExternalPatients: 2, listAllPatientNotes: 2, listCarePlans: 2 });
    await expect(search.getByRole('searchbox', { name: GLOBAL_QUERY, exact: true })).toHaveValue(before.query);
    await expect(search.locator('.vgs-row')).toHaveCount(before.count);
    await expect.poll(() => search.locator('.vgs-list').evaluate(node => node.scrollTop)).toBeCloseTo(before.scroll, 0);
    await expect.poll(() => created.frame.evaluate(() => window.scrollY)).toBeCloseTo(before.documentScroll, 0);
    expect(await created.frame.evaluate(() => window.__lifecycleInline.destroyed)).toBe(0);
    const restored = await search.evaluate(node => ({
      query: node.querySelector('.vgs-query').value, count: node.querySelectorAll('.vgs-row').length,
      scroll: node.querySelector('.vgs-list').scrollTop, documentScroll: node.ownerDocument.defaultView.scrollY,
    }));
    await queryGlobal(search, 'ukryty znacznik indeksu');
    await expect(resultFor(search, 'note', note.id)).toHaveCount(1);
    expect(await readState()).toEqual({ listPatients: 2, listExternalPatients: 2, listAllPatientNotes: 2, listCarePlans: 2 });
    expect(await storedFingerprint(created.frame)).toBe(afterWrite);
    expect(await created.frame.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    const proofPath = test.info().outputPath('retained-inline-proof.json');
    await writeFile(proofPath, JSON.stringify({
      viewport: page.viewportSize(), before, restored, readsAfterShow: await readState(),
      destroyed: await created.frame.evaluate(() => window.__lifecycleInline.destroyed), fingerprint: afterWrite,
    }, null, 2));
    await test.info().attach('retained-inline-proof', { contentType: 'application/json', path: proofPath });
  });
});
