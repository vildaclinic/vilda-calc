import { devices, expect, test } from '@playwright/test';
import { mutatePlan } from '../support/care-plans-fixture.mjs';
import { GLOBAL_QUERY, SEARCH_WORKSPACE, globalSearchFixture, openGlobalSearch, queryGlobal, resultFor } from '../support/global-search-fixture.mjs';
import { LONG_QUERY, RETURN_TO_SEARCH, actualGhControl, assertSearchContext, contextAtAction, openLongResult, persistedSearchFingerprint, searchNote, searchReturnFixture } from '../support/search-return-browser-fixture.mjs';

test.setTimeout(180000);

const profiles = [
  ['desktop 1440', { viewport: { width: 1440, height: 1000 } }],
  ['phone 390', { viewport: { width: 390, height: 852 }, isMobile: true, hasTouch: true,
    userAgent: devices['iPhone 15 Pro'].userAgent, deviceScaleFactor: devices['iPhone 15 Pro'].deviceScaleFactor }],
];

for (const [profile, settings] of profiles) test.describe(profile, () => {
  test.use({ ...settings, serviceWorkers: 'block', reducedMotion: 'reduce', actionTimeout: 15000, navigationTimeout: 30000 });

  test('patient return preserves the 81st result, both scroll positions, filters and subsequent list return', async ({ page }) => {
    const created = await searchReturnFixture(page);
    const persistedBefore = await persistedSearchFingerprint(created.frame, created.ids.a);
    let { search, listScroll } = await openLongResult(page, created);
    const action = search.getByRole('button', { name: 'Otwórz w karcie pacjenta ↗', exact: true });
    const before = await contextAtAction(search, action);
    expect(before.detailScroll, 'a real long preview was scrolled').toBeGreaterThan(1000);
    await action.click();
    const card = page.locator('.vilda-auth-patient-card');
    await expect(card).toBeVisible();
    await expect(card.locator(`[data-note-id="${created.longNotes[80]}"]`)).toBeVisible();
    await card.getByRole('button', { name: RETURN_TO_SEARCH, exact: true }).click();
    search = await assertSearchContext(page, before);
    if (profile.startsWith('phone')) {
      await search.getByRole('button', { name: '← Wyniki wyszukiwania', exact: true }).click();
      await expect(search).not.toHaveClass(/vgs-show-detail/);
      await expect(resultFor(search, 'note', created.longNotes[80])).toBeInViewport();
      await expect.poll(() => search.locator('.vgs-list').evaluate(node => node.scrollTop)).toBeCloseTo(listScroll, 0);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    expect(await persistedSearchFingerprint(created.frame, created.ids.a)).toBe(persistedBefore);
  });

  test('patient-name link, Browser Back and Escape return once without losing Search', async ({ page }) => {
    const created = await searchReturnFixture(page);
    let { search } = await openLongResult(page, created);
    const action = search.locator('.vb22-patient-link');
    const before = await contextAtAction(search, action);
    await action.click();
    await expect(page.locator('.vilda-auth-patient-card')).toBeVisible();
    await page.goBack();
    search = await assertSearchContext(page, before);
    await search.locator('.vb22-patient-link').click();
    const card = page.locator('.vilda-auth-patient-card');
    await expect(card).toBeVisible();
    await card.locator(`[data-note-id="${created.longNotes[80]}"]`).getByRole('button', { name: 'Edytuj', exact: true }).click();
    const editor = page.locator('.vilda-patient-note-editor-overlay');
    await editor.getByLabel('Treść', { exact: true }).fill('Fikcyjny niezapisany szkic z karty pacjenta.');
    page.once('dialog', dialog => dialog.dismiss());
    await page.keyboard.press('Escape');
    await expect(editor).toBeVisible();
    await expect(card).toBeVisible();
    page.once('dialog', dialog => dialog.accept());
    await page.keyboard.press('Escape');
    await expect(editor).toHaveCount(0);
    await expect(card).toBeVisible();
    await page.keyboard.press('Escape');
    await assertSearchContext(page, before);
    await expect(page.locator(SEARCH_WORKSPACE)).toHaveCount(1);
  });

  test('a patient header opens a real default tab and an external patient returns to its own result', async ({ page }) => {
    const created = await globalSearchFixture(page);
    let search = await openGlobalSearch(page);
    await queryGlobal(search, 'Bez Wpisów');
    await resultFor(search, 'patient', created.noMatters).click();
    let action = search.getByRole('button', { name: 'Otwórz kartę pacjenta ↗', exact: true });
    const headerContext = await contextAtAction(search, action);
    await action.click();
    let card = page.locator('.vilda-auth-patient-card');
    await expect(card).toBeVisible();
    await expect(card.locator('button[data-tab="antro"]')).toHaveClass(/active|selected/);
    await expect(card.locator('[data-tab="status"]')).toHaveCount(0);
    await card.getByRole('button', { name: RETURN_TO_SEARCH, exact: true }).click();
    search = await assertSearchContext(page, headerContext);
    await queryGlobal(search, 'konsultacja zewnętrzna');
    await resultFor(search, 'note', created.notes.external).click();
    action = search.getByRole('button', { name: 'Otwórz w karcie pacjenta ↗', exact: true });
    const externalContext = await contextAtAction(search, action);
    await action.click();
    const returnButton = page.getByRole('button', { name: RETURN_TO_SEARCH, exact: true });
    await expect(returnButton).toBeVisible();
    await expect(page.locator('.vilda-auth-overlay')).toContainText('Fikcyjny Zewnętrzny');
    await returnButton.click();
    await assertSearchContext(page, externalContext);
  });

  test('reminder and care-plan return restore the originating Search preview', async ({ page }) => {
    const created = await searchReturnFixture(page);
    let { search } = await openLongResult(page, created);
    let action = search.getByRole('button', { name: 'Otwórz sprawę', exact: true });
    const reminderContext = await contextAtAction(search, action);
    await action.click();
    await expect(page.locator(`${SEARCH_WORKSPACE} .vb22-detail:not(.vgs-detail)`)).toContainText(`${LONG_QUERY} 081`);
    await page.locator(SEARCH_WORKSPACE).getByRole('button', { name: RETURN_TO_SEARCH, exact: true }).click();
    search = await assertSearchContext(page, reminderContext);
    await search.getByRole('combobox', { name: 'Terminy spraw', exact: true }).selectOption('all');
    await queryGlobal(search, 'plan dalszego postępowania');
    await resultFor(search, 'plan', created.planId).click();
    action = search.getByRole('button', { name: 'Otwórz plan opieki ↗', exact: true });
    const careContext = await contextAtAction(search, action);
    await action.click();
    await expect(page.locator(`${SEARCH_WORKSPACE} .vcp-detail`)).toContainText('Fikcyjny plan dalszego postępowania');
    await page.locator(`${SEARCH_WORKSPACE} .vcp`).getByRole('button', { name: '← Szukaj', exact: true }).click();
    await assertSearchContext(page, careContext);
  });

  test('the temporary event editor returns after cancel, Escape and a real saved edit', async ({ page }) => {
    const created = await searchReturnFixture(page);
    let { search } = await openLongResult(page, created);
    const editor = page.locator('.vilda-patient-note-editor-overlay');
    for (const exit of ['cancel', 'escape', 'save']) {
      const action = search.getByRole('button', { name: 'Otwórz w Terminarzu ↗', exact: true });
      const before = await contextAtAction(search, action);
      await action.click();
      await expect(editor).toBeVisible();
      if (exit === 'cancel') await editor.getByRole('button', { name: 'Anuluj', exact: true }).click();
      else if (exit === 'escape') await page.keyboard.press('Escape');
      else {
        await editor.getByLabel('Treść', { exact: true }).fill('Fikcyjny opis zapisany podczas testu powrotu.');
        await editor.getByRole('button', { name: 'Zapisz zmiany', exact: true }).click();
      }
      await expect(editor).toHaveCount(0);
      if (exit === 'save') {
        // A shorter freshly read body clamps the old offset to its new range.
        await expect(search.locator('.vb22-body')).toHaveText('Fikcyjny opis zapisany podczas testu powrotu.');
        const maximum = await search.locator('.vgs-detail').evaluate(node => Math.max(0, node.scrollHeight - node.clientHeight));
        before.detailScroll = Math.min(before.detailScroll, maximum);
      }
      search = await assertSearchContext(page, before);
      if (exit === 'save') await expect(search.locator('.vb22-body')).toHaveText('Fikcyjny opis zapisany podczas testu powrotu.');
    }
  });

  test('a saved update rereads the long preview without resetting scroll or taking the query focus', async ({ page }) => {
    const created = await searchReturnFixture(page);
    const { search } = await openLongResult(page, created);
    const action = search.getByRole('button', { name: 'Otwórz w karcie pacjenta ↗', exact: true });
    const before = await contextAtAction(search, action);
    expect(before.detailScroll).toBeGreaterThan(1000);
    const query = search.getByRole('searchbox', { name: GLOBAL_QUERY, exact: true });
    await query.focus();
    await page.evaluate(async id => {
      const note = await window.VildaVault.getPatientNote(id);
      await window.VildaVault.savePatientNote({ ...note, baseRev: note.rev,
        body: note.body + '\n\nFikcyjna aktualizacja podczas aktywnego podglądu.' });
    }, created.longNotes[80]);
    await expect(search.locator('.vb22-body')).toContainText('Fikcyjna aktualizacja podczas aktywnego podglądu.');
    await assertSearchContext(page, before);
    await expect(query).toBeFocused();
  });

  test('a patient and editor opened from a Search matter return through that matter to the original preview', async ({ page }) => {
    const created = await searchReturnFixture(page);
    const { search } = await openLongResult(page, created);
    const action = search.getByRole('button', { name: 'Otwórz sprawę', exact: true });
    const before = await contextAtAction(search, action);
    await action.click();
    const matter = page.locator(`${SEARCH_WORKSPACE} .vb22-detail:not(.vgs-detail)`);
    await expect(matter).toContainText(`${LONG_QUERY} 081`);
    await matter.getByRole('button', { name: /^Otwórz Kartę pacjenta:/ }).click();
    const card = page.locator('.vilda-auth-patient-card');
    await expect(card).toBeVisible();
    await card.getByRole('button', { name: '← Wróć do sprawy', exact: true }).click();
    await expect(matter).toContainText(`${LONG_QUERY} 081`);
    let expectedBody = await page.evaluate(async id => (await window.VildaVault.getPatientNote(id)).body, created.longNotes[80]);
    for (const exit of ['cancel', 'escape', 'save']) {
      await matter.getByRole('button', { name: 'Edytuj treść przypomnienia', exact: true }).click();
      const editor = page.locator('.vilda-patient-note-editor-overlay');
      await expect(editor).toBeVisible();
      if (exit === 'cancel') await editor.getByRole('button', { name: 'Anuluj', exact: true }).click();
      else if (exit === 'escape') await page.keyboard.press('Escape');
      else {
        expectedBody += '\n\nFikcyjny zapis edytora otwartego ze sprawy po wyszukaniu.';
        await editor.getByLabel('Treść', { exact: true }).fill(expectedBody);
        await editor.getByRole('button', { name: 'Zapisz zmiany', exact: true }).click();
      }
      await expect(editor).toHaveCount(0);
      await expect(matter).toContainText(`${LONG_QUERY} 081`);
      await expect(matter.locator('.vb22-body')).toHaveText(expectedBody);
    }
    await matter.getByRole('button', { name: RETURN_TO_SEARCH, exact: true }).click();
    const restored = await assertSearchContext(page, before);
    await expect(restored.locator('.vb22-body')).toHaveText(expectedBody);
  });

  test('a temporary editor opened from a Search care plan returns through that plan to Search', async ({ page }) => {
    const created = await globalSearchFixture(page);
    const datedStep = await mutatePlan(created.frame, created.ids.a, created.planId, 'addStep', {
      step: { title: 'Fikcyjny termin planu do powrotu', kind: 'Kontrola', state: 'pending',
        reminderDateISO: '2027-05-03', eventDateISO: '2027-05-04', eventTime: '10:30', durationMin: 20 },
    });
    const search = await openGlobalSearch(page);
    await queryGlobal(search, 'plan dalszego postępowania');
    await resultFor(search, 'plan', created.planId).click();
    const action = search.getByRole('button', { name: 'Otwórz plan opieki ↗', exact: true });
    const before = await contextAtAction(search, action);
    await action.click();
    const panel = page.locator(`${SEARCH_WORKSPACE} .vcp`);
    await panel.locator(`[data-step-id="${datedStep.stepId}"]`).getByRole('button', { name: 'Otwórz termin ↗', exact: true }).click();
    const editor = page.locator('.vilda-patient-note-editor-overlay');
    await expect(editor).toBeVisible();
    await editor.getByRole('button', { name: 'Anuluj', exact: true }).click();
    await expect(editor).toHaveCount(0);
    await expect(panel.locator(`[data-step-id="${datedStep.stepId}"]`)).toBeVisible();
    await panel.getByRole('button', { name: '← Szukaj', exact: true }).click();
    await assertSearchContext(page, before);
  });

  test('lock invalidates the patient return ticket and unlocking cannot resurrect the old query', async ({ page }) => {
    const created = await globalSearchFixture(page);
    const search = await searchNote(page, created.notes.biopsy, 'badanie ambulatoryjne');
    await search.getByRole('button', { name: 'Otwórz w karcie pacjenta ↗', exact: true }).click();
    await expect(page.locator('.vilda-auth-patient-card')).toBeVisible();
    await page.evaluate(() => window.VildaVault.lock('manual'));
    await expect(page.locator('.vgs')).toHaveCount(0);
    await expect(page.getByRole('button', { name: RETURN_TO_SEARCH, exact: true })).toHaveCount(0);
    const auth = page.locator('#vilda-auth-ui-root');
    await auth.getByRole('button', { name: /Fikcyjny sejf testu panelu siatek/ }).click();
    await auth.locator('input[type=password]').fill('E2e#SiatkaNowyPomiar!2026');
    await auth.getByRole('button', { name: 'Zaloguj się', exact: true }).click();
    await page.waitForFunction(() => window.VildaVault?.isUnlocked() && window.VildaAuthUI?.isBootReady()
      && !document.documentElement.classList.contains('vilda-auth-locked'));
    await page.keyboard.press('Escape');
    await expect(page.locator('.vgs')).toHaveCount(0);
    const fresh = await openGlobalSearch(page);
    await expect(fresh.getByRole('searchbox', { name: GLOBAL_QUERY, exact: true })).toHaveValue('');
    await expect(fresh.locator('.vgs-row')).toHaveCount(0);
  });

  test('a real DocPro control opens its exact saved note and can return to Search', async ({ page }) => {
    const created = await globalSearchFixture(page);
    const { point, note } = await actualGhControl(page, created);
    let search = await searchNote(page, note.id, 'leczenie rhGH');
    const action = search.getByRole('button', { name: 'Otwórz w karcie pacjenta ↗', exact: true });
    const before = await contextAtAction(search, action);
    const savedBefore = await page.evaluate(id => window.VildaVault.getPatientNote(id), note.id);
    expect(savedBefore.ghPointId).toBe(String(point.id));
    await action.click();
    const card = page.locator('.vilda-auth-patient-card');
    await expect(card).toBeVisible();
    await expect(card.locator(`[data-note-id="${note.id}"]`)).toBeVisible();
    await expect(card.locator(`[data-note-id="${note.id}"]`)).toContainText(note.body);
    await expect(card.locator(`[data-note-id="${note.id}"]`).getByRole('button', { name: /^(Edytuj|Usuń)$/ })).toHaveCount(0);
    await card.getByRole('button', { name: RETURN_TO_SEARCH, exact: true }).click();
    search = await assertSearchContext(page, before);
    await expect(search.locator('.vb22-body')).toContainText('Kontrola leczenia hormonem wzrostu');
    expect(await page.evaluate(id => window.VildaVault.getPatientNote(id), note.id)).toEqual(savedBefore);
  });

  test('shell Search retains the 81st row through desktop inline expansion and a patient roundtrip', async ({ page }) => {
    const created = await searchReturnFixture(page, { shell: true });
    let listScroll;
    if (profile.startsWith('desktop')) {
      const inline = created.frame.locator('#remindersInline .vb22-inline');
      await inline.locator('[data-tab=search]').click();
      const inlineSearch = inline.locator('.vgs');
      ({ listScroll } = await openLongResult(page, created, { search: inlineSearch, inline: true }));
    } else {
      // The production inline card intentionally requires a fine pointer and
      // min-width:700px. Phone shell uses its actual header entry point.
      ({ listScroll } = await openLongResult(page, created));
    }
    let search = page.locator(`${SEARCH_WORKSPACE} .vgs`);
    await expect(search.locator('.vgs-row')).toHaveCount(96);
    await expect(search.locator('.vgs-title')).toHaveText(`${LONG_QUERY} 081`);
    expect(await search.locator('.vgs-list').evaluate(node => node.scrollTop)).toBeCloseTo(listScroll, 0);
    const action = search.getByRole('button', { name: 'Otwórz w karcie pacjenta ↗', exact: true });
    const before = await contextAtAction(search, action);
    await action.click();
    const card = page.locator('.vilda-auth-patient-card');
    await expect(card).toBeVisible();
    await card.getByRole('button', { name: RETURN_TO_SEARCH, exact: true }).click();
    search = await assertSearchContext(page, before);
    await expect(resultFor(search, 'note', created.longNotes[80])).toHaveAttribute('aria-current', 'true');
  });
});
