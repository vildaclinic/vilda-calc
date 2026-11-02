import { devices, expect, test } from '@playwright/test';
import { fixturePreferences, shellFrame } from '../support/centile-live-fixture.mjs';
import { GLOBAL_QUERY, SEARCH_WORKSPACE, globalSearchFixture, resultFor } from '../support/global-search-fixture.mjs';
import { RETURN_TO_SEARCH, assertSearchContext, contextAtAction, openLongResult, searchNote, searchReturnFixture } from '../support/search-return-browser-fixture.mjs';

const launchOptions = {
  ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH } : {}),
  args: ['--disable-features=BackForwardCache', '--no-sandbox'],
};
test.use({ launchOptions });
const profiles = [
  ['desktop 1440', { viewport: { width: 1440, height: 1000 } }],
  ['phone 390', { viewport: { width: 390, height: 852 }, isMobile: true, hasTouch: true,
    userAgent: devices['iPhone 15 Pro'].userAgent, deviceScaleFactor: devices['iPhone 15 Pro'].deviceScaleFactor }],
];

async function fingerprint(owner, patientId) {
  return owner.evaluate(async id => {
    const patient = await window.VildaVault.getPatient(id);
    const notes = (await window.VildaVault.listAllPatientNotes()).sort((left, right) => left.id.localeCompare(right.id));
    const bytes = new TextEncoder().encode(JSON.stringify({ patient, notes }));
    return [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map(byte => byte.toString(16).padStart(2, '0')).join('');
  }, patientId);
}

async function noEditor(page) {
  for (const frame of page.frames()) await expect(frame.locator('.vilda-patient-note-editor-overlay, #tzNewTermOverlay, .tz-pop')).toHaveCount(0);
}

async function findSearch(page) {
  let found;
  await expect.poll(async () => {
    for (const owner of [page, ...page.frames().filter(frame => frame !== page.mainFrame())]) {
      const search = owner.locator(`${SEARCH_WORKSPACE} .vgs`);
      if (await search.count() === 1 && await search.isVisible()) { found = { owner, search }; return true; }
    }
    return false;
  }).toBe(true);
  return found;
}

async function findWorkspace(page) {
  let found;
  await expect.poll(async () => {
    for (const owner of [page, ...page.frames().filter(frame => frame !== page.mainFrame())]) {
      const workspace = owner.locator(SEARCH_WORKSPACE);
      if (await workspace.count() === 1 && await workspace.isVisible()) { found = workspace; return true; }
    }
    return false;
  }).toBe(true);
  return found;
}

async function restoredSearch(page, expected) {
  const { owner } = await findSearch(page);
  return { owner, search: await assertSearchContext(owner, expected) };
}

async function calendarDiagnostic(owner) {
  return owner.evaluate(async () => {
    const token = new URLSearchParams(location.hash.slice(1)).get('vilda-search-return');
    const saved = token && await window.VildaSearchNavigation?.read(token, { consume: false });
    const descriptor = token && await window.VildaAuthUI?.getSearchCalendarTransfer?.(token);
    const bridge = token && await window.VildaAuthUI?.resolveSearchCalendarTarget?.(token);
    return { unlocked: window.VildaVault?.isUnlocked(), bootReady: window.VildaAuthUI?.isBootReady(),
      hasSaved: Boolean(saved), savedTarget: saved?.targetNoteId, hasDescriptor: Boolean(descriptor),
      hasBridge: Boolean(bridge), bridgeCurrent: bridge?.isCurrent?.(), expectedNoteId: bridge?.expectedNoteId,
      history: history.state, calendarText: document.getElementById('terminarzRoot')?.textContent.slice(0, 500) };
  });
}

async function selectedCalendar(owner, noteId, dateISO) {
  await owner.waitForFunction(() => Boolean(window.VildaVault?.isUnlocked() && window.VildaTerminarz?.openEvent));
  const root = owner.locator('#terminarzRoot');
  const target = root.locator(`[data-note-id="${noteId}"][aria-current="true"]`);
  try { await expect(target).toHaveCount(1); }
  catch (error) {
    console.log('Calendar target diagnostic:', JSON.stringify(await calendarDiagnostic(owner)));
    throw error;
  }
  await expect(target).toBeVisible();
  await expect(target).toBeInViewport();
  await expect(target).toHaveClass(/tz-event-selected/);
  await expect(root.locator('[data-view="day"]')).toHaveClass(/is-active/);
  const date = new Date(dateISO + 'T12:00:00');
  await expect(root.locator('.tz-title')).toContainText(String(date.getFullYear()));
  await expect(root.locator('.tz-title')).toContainText(String(date.getDate()));
  expect(await target.evaluate(node => !node.closest('.tz-vbody--ghost,.tz-tail-row,.tz-wb--tail'))).toBe(true);
  const note = await owner.evaluate(id => window.VildaVault.getPatientNote(id), noteId);
  const summary = root.locator(`[data-tz-selected-summary="${noteId}"]`);
  await expect(summary.locator('strong')).toHaveText(note.title);
  if (note.body) await expect(summary).not.toContainText(note.body);
  expect(await owner.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  return target;
}

async function openShellLongResult(page, created) {
  // Embedded mobile pages deliberately omit the inline workspace. The shell's
  // visible header is the real shared entry point on both screen widths.
  await page.locator('#vildaRemindersBtn').click();
  const workspace = await findWorkspace(page);
  await workspace.locator('[data-tab=search]').click();
  await openLongResult(page, created, { search: workspace.locator('.vgs') });
  return findSearch(page);
}

async function fictionalWriter(page) {
  const userId = await page.evaluate(() => window.VildaVault.getCurrentUser().userId);
  const writer = await page.context().newPage();
  await fixturePreferences(writer);
  await writer.clock.setFixedTime(new Date('2026-10-29T10:00:00+01:00'));
  await writer.goto('/index.html', { waitUntil: 'load' });
  await writer.waitForFunction(() => window.VildaAuthUI?.isBootReady());
  if (!await writer.evaluate(() => window.VildaVault.isUnlocked())) {
    const auth = writer.locator('#vilda-auth-ui-root');
    await auth.getByRole('button', { name: /Fikcyjny sejf testu panelu siatek/ }).click();
    await auth.locator('input[type=password]').fill('E2e#SiatkaNowyPomiar!2026');
    await auth.getByRole('button', { name: 'Zaloguj się', exact: true }).click();
  }
  await writer.waitForFunction(() => window.VildaVault?.isUnlocked() && !document.documentElement.classList.contains('vilda-auth-locked'));
  expect(await writer.evaluate(() => window.VildaVault.getCurrentUser().userId)).toBe(userId);
  return writer;
}

for (const [profile, settings] of profiles) test.describe(profile, () => {
  test.use({ ...settings, serviceWorkers: 'block', reducedMotion: 'reduce', actionTimeout: 15000, navigationTimeout: 30000 });
  test.setTimeout(180000);

  test('standalone uses a real calendar day and preserves the 81st result through full document reloads and Browser Back', async ({ page }) => {
    await page.addInitScript(() => { window.__searchCalendarDocumentId = crypto.randomUUID(); });
    const created = await searchReturnFixture(page);
    let { search } = await openLongResult(page, created);
    const saved = await fingerprint(page, created.ids.a);
    for (const exit of ['button', 'browser']) {
      const documentId = await page.evaluate(() => window.__searchCalendarDocumentId);
      const action = search.getByRole('button', { name: 'Otwórz w Terminarzu ↗', exact: true });
      const before = await contextAtAction(search, action);
      expect(before).toMatchObject({ count: 96, time: 'future', status: 'open', detail: true });
      expect(before.detailScroll).toBeGreaterThan(1000);
      await action.click();
      await expect(page).toHaveURL(/\/terminarz\.html(?:[?#]|$)/);
      await selectedCalendar(page, created.longNotes[80], '2027-06-01');
      await noEditor(page);
      // All 96 appointments overlap at 10:30: the selected 81st appointment
      // must have its own visible card, rather than only an overflow lookup.
      expect(await page.locator('#terminarzRoot .tz-daymore').evaluateAll((nodes, id) =>
        nodes.every(node => !(node.dataset.moreIds || '').split(',').includes(id)), created.longNotes[80])).toBe(true);
      expect(await fingerprint(page, created.ids.a)).toBe(saved);
      if (exit === 'button') await page.getByRole('button', { name: RETURN_TO_SEARCH, exact: true }).click();
      else await page.goBack();
      ({ search } = await restoredSearch(page, before));
      expect(await page.evaluate(() => window.__searchCalendarDocumentId)).not.toBe(documentId);
      expect(await fingerprint(page, created.ids.a)).toBe(saved);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    }
  });

  test('standalone Search from an existing calendar target replaces the old token and returns to the same source page by button and Back', async ({ page }) => {
    await page.addInitScript(() => { window.__searchCalendarDocumentId = crypto.randomUUID(); });
    const created = await searchReturnFixture(page);
    let { search } = await openLongResult(page, created);
    const saved = await fingerprint(page, created.ids.a);
    await search.getByRole('button', { name: 'Otwórz w Terminarzu ↗', exact: true }).click();
    await expect(page).toHaveURL(/\/terminarz\.html(?:[?#]|$)/);
    await selectedCalendar(page, created.longNotes[80], '2027-06-01');
    const oldToken = new URLSearchParams(new URL(page.url()).hash.slice(1)).get('vilda-search-return');
    expect(oldToken).toBeTruthy();
    // Open an actual new Search while the calendar still has the previous
    // target URL. The next journey must not reuse that old destination token.
    await page.locator('#vildaRemindersBtn').click();
    const workspace = await findWorkspace(page);
    await workspace.locator('[data-tab=search]').click();
    ({ search } = await openLongResult(page, created, { search: workspace.locator('.vgs') }));
    for (const exit of ['button', 'browser']) {
      const documentId = await page.evaluate(() => window.__searchCalendarDocumentId);
      const sourceToken = new URLSearchParams(new URL(page.url()).hash.slice(1)).get('vilda-search-return');
      const action = search.getByRole('button', { name: 'Otwórz w Terminarzu ↗', exact: true });
      const before = await contextAtAction(search, action);
      await action.click();
      await page.waitForFunction(previous => {
        const token = new URLSearchParams(location.hash.slice(1)).get('vilda-search-return');
        return Boolean(token && token !== previous);
      }, sourceToken);
      await selectedCalendar(page, created.longNotes[80], '2027-06-01');
      expect(await page.evaluate(() => window.__searchCalendarDocumentId)).toBe(documentId);
      const token = new URLSearchParams(new URL(page.url()).hash.slice(1)).get('vilda-search-return');
      expect(token).toBeTruthy();
      expect(token).not.toBe(oldToken);
      await noEditor(page);
      if (exit === 'button') await page.getByRole('button', { name: RETURN_TO_SEARCH, exact: true }).click();
      else await page.goBack();
      ({ search } = await restoredSearch(page, before));
      await expect(page).toHaveURL(/\/terminarz\.html(?:[?#]|$)/);
      expect(new URLSearchParams(new URL(page.url()).hash.slice(1)).has('vilda-event')).toBe(false);
      expect(await fingerprint(page, created.ids.a)).toBe(saved);
    }
  });

  test('shell delivers a cold and then retained calendar frame and restores Search after button return and Back', async ({ page }) => {
    const created = await searchReturnFixture(page, { shell: true });
    let { search } = await openShellLongResult(page, created);
    const saved = await fingerprint(created.frame, created.ids.a);
    let calendarDocument;
    for (const exit of ['button', 'browser']) {
      const action = search.getByRole('button', { name: 'Otwórz w Terminarzu ↗', exact: true });
      const before = await contextAtAction(search, action);
      await action.click();
      const calendar = await shellFrame(page, 'Terminarz');
      await selectedCalendar(calendar, created.longNotes[80], '2027-06-01');
      const identity = await calendar.evaluate(() => {
        window.__searchCalendarIdentity ||= crypto.randomUUID(); return window.__searchCalendarIdentity;
      });
      if (calendarDocument) expect(identity).toBe(calendarDocument);
      calendarDocument = identity;
      await noEditor(page);
      if (exit === 'button') await calendar.getByRole('button', { name: RETURN_TO_SEARCH, exact: true }).click();
      else await page.goBack();
      ({ search } = await restoredSearch(page, before));
      expect(await fingerprint(created.frame, created.ids.a)).toBe(saved);
    }
  });

  test('shell returns to a manually changed laboratory source without replaying its original indication deep link or delayed scroll', async ({ page }) => {
    const created = await searchReturnFixture(page, { shell: true });
    await page.evaluate(() => window.VildaShell.navigate('lab', true, 'przelicznik-jednostek.html?wskazanie=obesity_kids'));
    const lab = await shellFrame(page, 'Jednostki laboratoryjne');
    const indication = lab.locator('#labClinicalIndication');
    await expect(indication).toHaveValue('obesity_kids');
    // Finish the producer's real 400 ms deep-link scroll before the user
    // changes the source. A return must not replay that old intent later.
    await lab.waitForTimeout(700);
    await indication.selectOption('adrenal_insufficiency');
    await expect(lab.locator('#labSuggestResultsTitle')).toContainText('Niedoczynność kory nadnerczy');
    const identity = await lab.evaluate(() => {
      window.__searchCalendarLabIdentity = crypto.randomUUID(); return window.__searchCalendarLabIdentity;
    });
    const saved = await fingerprint(lab, created.ids.a);

    for (const exit of ['button', 'browser']) {
      await lab.evaluate(() => window.scrollTo({ top: 320, behavior: 'instant' }));
      await expect.poll(() => lab.evaluate(() => window.scrollY)).toBeGreaterThan(100);
      const sourceScroll = await lab.evaluate(() => window.scrollY);
      const { search } = await openShellLongResult(page, created);
      const action = search.getByRole('button', { name: 'Otwórz w Terminarzu ↗', exact: true });
      const before = await contextAtAction(search, action);
      await action.click();
      const calendar = await shellFrame(page, 'Terminarz');
      await selectedCalendar(calendar, created.longNotes[80], '2027-06-01');
      if (exit === 'button') await calendar.getByRole('button', { name: RETURN_TO_SEARCH, exact: true }).click();
      else await page.goBack();
      const { search: restored } = await restoredSearch(page, before);
      await restored.locator('xpath=ancestor::dialog').getByRole('button', { name: 'Zamknij Przypomnienia', exact: true }).click();
      await expect(page).toHaveURL(/#\/lab$/);
      // The old implementation redelivered sourceHref on return, resetting
      // the dropdown immediately and moving the document after another 400 ms.
      await lab.waitForTimeout(650);
      await expect(indication).toHaveValue('adrenal_insufficiency');
      expect(await lab.evaluate(() => window.__searchCalendarLabIdentity)).toBe(identity);
      await expect.poll(() => lab.evaluate(() => window.scrollY)).toBeCloseTo(sourceScroll, 0);
      expect(await fingerprint(lab, created.ids.a)).toBe(saved);
      await noEditor(page);
    }
  });

  test('Search already inside the calendar shell route returns once through Browser Back', async ({ page }) => {
    const created = await searchReturnFixture(page, { shell: true });
    await page.evaluate(() => window.VildaShell.navigate('terminarz'));
    const calendar = await shellFrame(page, 'Terminarz');
    await calendar.waitForFunction(() => window.VildaVault?.isUnlocked() && window.VildaAuthUI?.isBootReady());
    await page.locator('#vildaRemindersBtn').click();
    const workspace = await findWorkspace(page);
    await workspace.locator('[data-tab=search]').click();
    let { search } = await findSearch(page);
    ({ search } = await openLongResult(page, created, { search }));
    const action = search.getByRole('button', { name: 'Otwórz w Terminarzu ↗', exact: true });
    const before = await contextAtAction(search, action);
    const saved = await fingerprint(calendar, created.ids.a);
    await action.click();
    await selectedCalendar(calendar, created.longNotes[80], '2027-06-01');
    await page.goBack();
    await restoredSearch(page, before);
    expect(await fingerprint(calendar, created.ids.a)).toBe(saved);
    await noEditor(page);
  });

  for (const change of ['moved', 'deleted']) test(`a ${change} target is reread after Search captures navigation and before the calendar document loads`, async ({ page }) => {
    const created = await globalSearchFixture(page);
    const search = await searchNote(page, created.notes.biopsy, 'badanie ambulatoryjne');
    const action = search.getByRole('button', { name: 'Otwórz w Terminarzu ↗', exact: true });
    const before = await contextAtAction(search, action);
    // A document request has already detached the source execution context.
    // Use a second real page of this exclusively fictional account to mutate
    // the shared IndexedDB record while the target response is held.
    const writer = await fictionalWriter(page);
    let changedFingerprint;
    await page.route('**/terminarz.html*', async route => {
      await writer.evaluate(async ({ id, change }) => {
        const note = await window.VildaVault.getPatientNote(id);
        if (change === 'deleted') await window.VildaVault.removePatientNote(id);
        else await window.VildaVault.savePatientNote({ ...note, baseRev: note.rev, dueDateISO: '2027-09-15', dueTime: '14:15' });
      }, { id: created.notes.biopsy, change });
      changedFingerprint = await fingerprint(writer, created.ids.a);
      await writer.close();
      await route.continue();
    }, { times: 1 });
    await action.click();
    await expect(page).toHaveURL(/\/terminarz\.html(?:[?#]|$)/);
    if (change === 'moved') await selectedCalendar(page, created.notes.biopsy, '2027-09-15');
    else {
      await expect(page.locator('#terminarzRoot [data-tz-search-navigation] [role=status]')).toContainText('Nie można');
      await expect(page.locator('#terminarzRoot [aria-current="true"][data-note-id]')).toHaveCount(0);
      if (!await page.getByRole('button', { name: RETURN_TO_SEARCH, exact: true }).count()) console.log('Deleted target diagnostic:', JSON.stringify(await calendarDiagnostic(page)));
    }
    await noEditor(page);
    expect(await fingerprint(page, created.ids.a)).toBe(changedFingerprint);
    await page.getByRole('button', { name: RETURN_TO_SEARCH, exact: true }).click();
    const restored = await findSearch(page);
    await expect(restored.search.getByRole('searchbox', { name: GLOBAL_QUERY, exact: true })).toHaveValue(before.query);
    await expect(restored.search.getByRole('combobox', { name: 'Daty wpisów', exact: true })).toHaveValue(before.time);
    await expect(restored.search.getByRole('combobox', { name: 'Stan spraw', exact: true })).toHaveValue(before.status);
    if (change === 'deleted') await expect(resultFor(restored.search, 'note', created.notes.biopsy)).toHaveCount(0);
    expect(await fingerprint(page, created.ids.a)).toBe(changedFingerprint);
  });

  test('all-day, second absence and midnight targets remain exact visible events through real calendar refresh', async ({ page }) => {
    const created = await globalSearchFixture(page);
    const cases = await page.evaluate(async patientId => {
      const vault = window.VildaVault, result = [];
      for (let index = 0; index < 5; index += 1) {
        const note = await vault.savePatientNote({ patientId, category: 'followup', dueDateISO: '2027-06-02',
          title: 'Fikcyjny audyt całodniowy ' + index, body: 'Fikcyjny wpis organizacyjny bez godziny.' });
        if (index === 4) result.push({ id: note.id, query: 'Fikcyjny audyt całodniowy 4', date: '2027-06-02', kind: 'all-day' });
      }
      for (let index = 0; index < 2; index += 1) {
        const note = await vault.savePatientNote({ patientId: vault.ACTIVITY_PATIENT_ID, category: 'absence', dueDateISO: '2027-06-03',
          title: 'Fikcyjny audyt nieobecności ' + index, body: 'Fikcyjna nieobecność testowa ' + index });
        if (index === 1) result.push({ id: note.id, query: 'Fikcyjny audyt nieobecności 1', date: '2027-06-03', kind: 'absence' });
      }
      const midnight = await vault.savePatientNote({ patientId, category: 'followup', dueDateISO: '2027-06-04', dueTime: '23:30', durationMin: 120,
        title: 'Fikcyjny audyt przez północ', body: 'Fikcyjny termin przekraczający północ.' });
      result.push({ id: midnight.id, query: 'Fikcyjny audyt przez północ', date: '2027-06-04', kind: 'midnight' });
      return result;
    }, created.ids.a);
    const saved = await fingerprint(page, created.ids.a);
    for (const item of cases) {
      const search = await searchNote(page, item.id, item.query);
      const action = search.getByRole('button', { name: 'Otwórz w Terminarzu ↗', exact: true });
      const before = await contextAtAction(search, action);
      await action.click();
      const target = await selectedCalendar(page, item.id, item.date);
      await page.evaluate(() => window.VildaTerminarz.refresh());
      await expect(target).toHaveAttribute('aria-current', 'true');
      if (item.kind === 'all-day' && profile.startsWith('phone')) {
        await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
        await expect(page.locator('.tz-allday-stick')).not.toHaveClass(/is-collapsed/);
        await expect(target).toBeVisible();
        await target.scrollIntoViewIfNeeded();
        await expect(target).toBeInViewport();
      }
      if (item.kind === 'absence') {
        await expect(target).toHaveClass(/tz-selected-absence/);
        await expect(target).toContainText('Fikcyjny audyt nieobecności 1');
        await expect(target.locator('button')).toHaveCount(0);
      }
      await noEditor(page);
      expect(await fingerprint(page, created.ids.a)).toBe(saved);
      await page.getByRole('button', { name: RETURN_TO_SEARCH, exact: true }).click();
      const { search: restored } = await restoredSearch(page, before);
      // Close the restored workspace so the next actual Search starts cleanly.
      await restored.locator('xpath=ancestor::dialog').getByRole('button', { name: 'Zamknij Przypomnienia', exact: true }).click();
    }
    expect(await fingerprint(page, created.ids.a)).toBe(saved);
  });
});
