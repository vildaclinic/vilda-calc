import { expect, test } from '@playwright/test';
import { visibleChromeMenu } from '../support/chrome-menu-fixture.mjs';
import { fictionalPatient, readyForPatient, shellFrame } from '../support/centile-live-fixture.mjs';
import { prepareGabinet as prepare, choosePatient } from '../support/gabinet-patient-fixture.mjs';

test.use({ serviceWorkers: 'block', contextOptions: { reducedMotion: 'reduce' } });
test.setTimeout(180_000);

async function headerGeometry(frame) {
  return frame.locator('#vhomeGabinetHeader').evaluate(header => {
    return [header, ...header.querySelectorAll('[role="tab"]')].map(node => {
      const { x, y, width, height } = node.getBoundingClientRect();
      return [x, y, width, height];
    });
  });
}

async function expectHeaderAppearance(frame) {
  const header = frame.locator('#vhomeGabinetHeader');
  const active = header.getByRole('tab', { selected: true });
  const inactive = header.getByRole('tab', { selected: false });
  const breadcrumb = header.locator('[data-start]');
  for (const button of [breadcrumb, active, inactive]) {
    await expect(button).toHaveCSS('box-shadow', 'none');
    await expect(button).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
  }
  await expect(breadcrumb).toHaveCSS('color', 'rgb(0, 110, 117)');
  await expect(active).toHaveCSS('color', 'rgb(0, 107, 114)');
  await expect(active).toHaveCSS('border-bottom', '3px solid rgb(0, 131, 139)');
  await expect(inactive).toHaveCSS('color', 'rgb(86, 111, 117)');
  await expect(inactive).toHaveCSS('border-bottom-color', 'rgba(0, 0, 0, 0)');
  await expect(header.locator('[data-history]')).toHaveCSS('background-color', 'rgb(255, 255, 255)');
  await expect(header.locator('[data-home-encounter]')).toHaveCSS('background-color', 'rgb(0, 124, 132)');
}

async function horizontalEdges(locator) {
  return locator.evaluate(node => {
    const { left, right } = node.getBoundingClientRect();
    return { left, right };
  });
}

async function hitTestPositions(locator) {
  return locator.evaluateAll(nodes => nodes.map(node => {
    const { left, top, right, bottom } = node.getBoundingClientRect();
    const hit = document.elementFromPoint((left + right) / 2, (top + bottom) / 2);
    const target = node.closest('a,button') || node;
    return { left, top, visible: right > left && bottom > top && left >= 0 && top >= 0 &&
      right <= innerWidth && bottom <= innerHeight && target.contains(hit) };
  }));
}

async function scrollToVisibleFooter(frame, screen, requireOverflow = false) {
  await frame.evaluate(() => {
    const scroller = document.scrollingElement;
    scroller.scrollTo({ top: scroller.scrollHeight, behavior: 'instant' });
  });
  await expect.poll(() => frame.evaluate(() => {
    const scroller = document.scrollingElement;
    return Math.round(scroller.scrollHeight - scroller.clientHeight - scroller.scrollTop);
  }), { message: 'Rzeczywisty koniec przewijania · ' + screen }).toBe(0);
  const footer = await frame.locator('.site-footer').evaluate(node => {
    const { top, bottom } = node.getBoundingClientRect();
    return { top, bottom, viewportHeight: innerHeight, scroll: document.scrollingElement.scrollTop };
  });
  expect(footer.top, 'Widoczna stopka · ' + screen).toBeGreaterThanOrEqual(0);
  expect(footer.bottom, 'Cała stopka mieści się w widoku · ' + screen).toBeLessThanOrEqual(footer.viewportHeight + 0.5);
  if (requireOverflow) expect(footer.scroll, 'Przewinięta treść · ' + screen).toBeGreaterThan(100);
}

test('the outer header stays visible and aligned while switching or scrolling Gabinet screens', async ({ page }) => {
  const { frame } = await prepare(page);
  const start = frame.locator('#vhomeGabinetStart');
  const entryBack = frame.locator('#gbEntryHeader').getByRole('button', { name: 'Ekran startowy' });
  const patientBack = frame.locator('#vhomeGabinetHeader [data-start]');
  const analysis = frame.locator('#vhomeGabinetAnalysisTab');

  for (const { width, height } of [{ width: 1600, height: 800 }, { width: 390, height: 480 }]) {
    await page.setViewportSize({ width, height });
    const leading = width > 991 ? '.chrome-brand-logo' : '[data-vilda-chrome-menu-btn]';
    const controls = page.locator('.chrome-strip').locator(leading + ', #vildaHeaderSearchBtn, #vildaRemindersBtn');
    await expect(controls).toHaveCount(3);
    for (const control of await controls.all()) await expect(control).toBeInViewport({ ratio: 1 });
    const baseline = await hitTestPositions(controls);
    expect(baseline.every(box => box.visible)).toBe(true);

    async function expectAnchored(screen) {
      await expect.poll(() => hitTestPositions(controls), {
        message: 'Dokładne położenie i hit-test globalnego nagłówka przy szerokości ' + width + ' px · ' + screen,
      }).toEqual(baseline);
    }
    async function checkScroll(screen, requireOverflow = false, pinned) {
      await expectAnchored(screen);
      await frame.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
      const beforeScroll = pinned ? await hitTestPositions(pinned) : [];
      await scrollToVisibleFooter(frame, screen, requireOverflow);
      if (pinned) {
        expect(beforeScroll.every(box => box.visible)).toBe(true);
        await expect.poll(() => hitTestPositions(pinned), { message: 'Przypięta nawigacja i hit-test · ' + screen })
          .toEqual(beforeScroll);
      }
      // The browser can also hand scrolling to the outer document at the pane boundary.
      await page.evaluate(() => window.scrollTo({ top: document.scrollingElement.scrollHeight, behavior: 'instant' }));
      await expectAnchored(screen + ' po przewinięciu');
      await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
      await frame.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
    }

    await expect(start.locator('[data-entry="office"]')).toBeVisible();
    await checkScroll('Ekran startowy');
    await start.locator('[data-entry="rapid"]').click();
    await expect(frame.locator('#gbRapidTitle')).toBeVisible();
    await checkScroll('Szybka ścieżka', width < 500, entryBack);
    await entryBack.click();
    await start.locator('[data-entry="office"]').click();
    await expect(start.locator('.vgs-office-grid')).toBeVisible();
    await checkScroll('Gabinet', width < 500);
    await choosePatient(frame, 'Antoni');
    await checkScroll('Przegląd');
    await analysis.click();
    await expect(analysis).toHaveAttribute('aria-selected', 'true');
    await checkScroll('Analiza', true, width > 991 ? patientBack.or(analysis) : patientBack);
    if (width < 500) {
      const stickyHeight = await frame.evaluate(() => parseFloat(getComputedStyle(document.documentElement).scrollPaddingTop));
      expect(stickyHeight).toBeGreaterThan(40);
      expect(stickyHeight, 'Na telefonie pozostaje miejsce na pomiary').toBeLessThan(100);
    }
    await patientBack.click();
    await entryBack.click();
    await expect(start.locator('[data-entry="office"]')).toBeVisible();
    await expectAnchored('Powrót na ekran startowy');
  }

  // Reuse the same fictional account and patients on the standalone entry.
  // A restored selection may already show the patient instead of the picker.
  for (const { width, height } of [{ width: 1440, height: 600 }, { width: 390, height: 480 }]) {
    await page.setViewportSize({ width, height });
    await page.goto('/index.html', { waitUntil: 'load' });
    await readyForPatient(page);
    const header = page.locator('#vhomeGabinetHeader');
    if (!await header.isVisible()) await choosePatient(page, 'Antoni');
    else await expect(header).toContainText('Antoni');
    const analysisTab = page.locator('#vhomeGabinetAnalysisTab');
    await analysisTab.click();
    await expect(analysisTab).toHaveAttribute('aria-selected', 'true');
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
    const leading = width > 991 ? '.chrome-brand-logo' : '[data-vilda-chrome-menu-btn]';
    const controls = page.locator('.chrome-strip').locator(leading + ', #vildaHeaderSearchBtn, #vildaRemindersBtn');
    const breadcrumb = header.locator('[data-start]');
    await expect(controls).toHaveCount(3);
    const globalBefore = await hitTestPositions(controls);
    const crumbBefore = await hitTestPositions(breadcrumb);
    expect(globalBefore.every(box => box.visible)).toBe(true);
    expect(crumbBefore.every(box => box.visible)).toBe(true);
    await scrollToVisibleFooter(page, 'Samodzielna Analiza ' + width + '×' + height, true);
    await expect.poll(() => hitTestPositions(controls), { message: 'Samodzielny globalny nagłówek x/y i hit-test' })
      .toEqual(globalBefore);
    await expect.poll(() => hitTestPositions(breadcrumb), { message: 'Samodzielna ścieżka nawigacji x/y i hit-test' })
      .toEqual(crumbBefore);
    const heightField = page.locator('#height');
    await heightField.evaluate(node => node.scrollIntoView({ block: 'start', behavior: 'instant' }));
    await expect.poll(() => hitTestPositions(heightField)).toEqual([expect.objectContaining({ visible: true })]);
  }
});

test('Gabinet A keeps its navigation fixed and opens the chosen patient record', async ({ page }) => {
  const { frame, ids } = await prepare(page);
  const reminderTitle = 'Fikcyjne przypomnienie o wynikach';
  const planTitle = 'Fikcyjny plan obserwacji';
  await frame.evaluate(async ({ ids, reminderTitle, planTitle }) => {
    const today = new Date().toLocaleDateString('sv-SE');
    await window.VildaVault.savePatientNote({
      patientId: ids.a, category: 'followup', title: 'Fikcyjna wizyta kontrolna', dueDateISO: today, dueTime: '09:00',
    });
    await window.VildaVault.savePatientNote({
      patientId: ids.a, category: 'reminder-contact', title: reminderTitle, dueDateISO: today,
    });
    const result = await window.VildaVault.mutateCarePlan({
      patientId: ids.b, action: 'create', operationId: crypto.randomUUID(), title: planTitle, goal: 'Fikcyjny cel',
    });
    if (!result.saved) throw new Error('Nie zapisano testowego planu.');
  }, { ids, reminderTitle, planTitle });

  const start = frame.locator('#vhomeGabinetStart');
  await start.locator('[data-entry="office"]').click();
  const grid = start.locator('.vgs-office-grid');
  await expect(grid.locator('h2')).toHaveText(['Znajdź pacjenta', 'Dzisiejsze wizyty', 'Przypomnienia', 'Plany opieki']);
  await expect(grid.locator('.vgs-schedule .vgs-appointment')).toHaveCount(1);
  await expect(grid.locator('.vgs-schedule')).toContainText('09:00');
  const reminder = grid.locator('.vgs-reminders').getByRole('button', { name: new RegExp(reminderTitle) });
  const plan = grid.locator('.vgs-care').getByRole('button', { name: new RegExp(planTitle) });
  await expect(reminder).toBeVisible();
  await expect(plan).toBeVisible();
  const officeCrumb = frame.locator('#gbEntryHeader .gb-breadcrumb');
  const patientCrumb = frame.locator('#vhomeGabinetHeader .gb-breadcrumb');
  const breadcrumbPosition = locator => locator.evaluate(node => {
    const { x, y } = node.getBoundingClientRect();
    return { x, y };
  });
  const cards = () => grid.locator(':scope > section').evaluateAll(nodes =>
    nodes.map(node => {
      const { x, y, width, height } = node.getBoundingClientRect();
      return { x, y, width, height };
    }));
  const desktop = await cards();
  expect(desktop.every(card => card.width === desktop[0].width && card.height === desktop[0].height)).toBe(true);
  expect(desktop[1].x).toBeGreaterThan(desktop[0].x);
  expect(desktop[2].x).toBe(desktop[0].x);
  expect(desktop[2].y).toBeGreaterThan(desktop[0].y);
  const search = start.getByRole('searchbox');
  await search.fill('Antoni');
  await expect(start.locator('#vgs-results')).toBeVisible();
  expect(await cards()).toEqual(desktop);
  await search.press('Escape');
  await expect(start.locator('#vgs-results')).toBeHidden();
  const before = await breadcrumbPosition(officeCrumb);
  const edges = await horizontalEdges(grid);

  await reminder.click();
  await expect(frame.locator('#vhomePatientOverview #remindersInline [aria-current="true"]')).toContainText(reminderTitle);
  expect(await breadcrumbPosition(patientCrumb)).toEqual(before);
  expect(await horizontalEdges(frame.locator('#vhomePatientOverview'))).toEqual(edges);

  await patientCrumb.getByRole('button').click();
  await expect(plan).toBeVisible();
  await plan.click();
  await expect(frame.locator('#vhomePatientOverview .vcp-detail .vcp-title')).toHaveText(planTitle);
  expect(await breadcrumbPosition(patientCrumb)).toEqual(before);

  await page.setViewportSize({ width:390, height:844 });
  const phone = await breadcrumbPosition(patientCrumb);
  await patientCrumb.getByRole('button').click();
  await expect(officeCrumb).toBeVisible();
  expect(await breadcrumbPosition(officeCrumb)).toEqual(phone);
  const stacked = await cards();
  expect(stacked.every(card => card.x === stacked[0].x)).toBe(true);
  expect(stacked.map(card => card.y)).toEqual(stacked.map(card => card.y).sort((a,b) => a-b));
});

test('Gabinet uses one patient header for overview and analysis and displays reminders only in the overview', async ({ page }) => {
  const { frame, ids } = await prepare(page);
  const today = new Date().toISOString().slice(0, 10);
  await frame.evaluate(async ({ ids, today }) => {
    for (const [key, patientId] of Object.entries(ids)) {
      await window.VildaVault.savePatientNote({
        patientId, category: 'reminder-contact', title: 'Fikcyjne przypomnienie gabinetowe ' + key,
        dueDateISO: today,
      });
    }
  }, { ids, today });
  await choosePatient(frame, 'Antoni');
  const overview = frame.locator('#vhomeGabinetOverviewTab');
  const analysis = frame.locator('#vhomeGabinetAnalysisTab');
  const patientCard = frame.locator('#vhomePatientOverview > .vilda-auth-card');
  const measurements = frame.locator('#userSection fieldset.user-card');
  const summary = frame.locator('#currentSummaryCard');
  const toolbar = page.locator('#vildaHeaderSearchBtn, #vildaRemindersBtn');
  const toolbarPositions = () => toolbar.evaluateAll(buttons => buttons.map(button => button.getBoundingClientRect().left));
  const overviewPanels = patientCard.locator('.vhome-b1-panels');
  const workspaceBackground = () => frame.locator('body').evaluate(body => getComputedStyle(body).backgroundColor);
  async function checkPatientLayout(width, rightEdge) {
    await page.setViewportSize({ width, height: 900 });
    await overview.click();
    await expect(overview).toHaveAttribute('aria-selected', 'true');
    await expect(patientCard.locator(':scope > .vhome-native-patient-card')).toBeVisible();
    await page.mouse.move(0, 0);
    await expectHeaderAppearance(frame);
    const before = await headerGeometry(frame);
    const cardEdges = await horizontalEdges(patientCard);
    const canvas = await workspaceBackground();
    const cardShadow = await patientCard.evaluate(card => getComputedStyle(card).boxShadow);
    await expect(overviewPanels).toHaveCSS('background-color', canvas);
    await expect(overviewPanels.locator(':scope > .vilda-patient-tab-content:visible')).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
    const toolbarBefore = await toolbarPositions();
    expect(toolbarBefore).toHaveLength(2);

    await analysis.click();
    await expect(analysis).toHaveAttribute('aria-selected', 'true');
    await expect(measurements).toBeVisible();
    await expect(measurements).toHaveCSS('box-shadow', cardShadow);
    await expect(rightEdge).toBeVisible();
    await expect(frame.locator('#vhomePatientCard')).toBeHidden();
    await expect(frame.locator('#vhomeAdultVitalsCard')).toBeHidden();
    await expect(frame.locator('#remindersInline')).toBeHidden();
    await page.mouse.move(0, 0);
    await expectHeaderAppearance(frame);
    const formEdges = await horizontalEdges(measurements);
    const analysisEdges = await horizontalEdges(rightEdge);
    expect(Math.abs(formEdges.left - cardEdges.left), 'Lewa krawędź Pomiary / Karta pacjenta').toBeLessThanOrEqual(1);
    expect(Math.abs(analysisEdges.right - cardEdges.right), 'Prawa krawędź Analiza / Karta pacjenta').toBeLessThanOrEqual(1);
    expect(await headerGeometry(frame)).toEqual(before);
    expect(await workspaceBackground()).toBe(canvas);
    expect(await toolbarPositions()).toEqual(toolbarBefore);
  }
  for (const width of [1440, 1920, 834, 390]) {
    await checkPatientLayout(width, summary);
    const comparison = frame.locator('#vhomeVisitComparison');
    await expect(comparison).toBeVisible();
    const positions = await comparison.evaluate(card => {
      const rect = selector => document.querySelector(selector).getBoundingClientRect();
      const form = rect('#userSection fieldset.user-card'), summary = rect('#currentSummaryCard');
      const growth = rect('#vhomeGrowthCard'), bounds = card.getBoundingClientRect();
      return {
        below: bounds.top >= Math.max(summary.bottom, form.bottom) - 1,
        beforeGrowth: !growth.height || bounds.bottom <= growth.top + 1,
        left: Math.abs(bounds.left - form.left),
        right: Math.abs(bounds.right - summary.right),
        overflow: bounds.left < -1 || bounds.right > document.documentElement.clientWidth + 1,
      };
    });
    expect(positions.below).toBe(true);
    expect(positions.beforeGrowth).toBe(true);
    expect(positions.left).toBeLessThanOrEqual(1);
    expect(positions.right).toBeLessThanOrEqual(1);
    expect(positions.overflow).toBe(false);
  }

  const header = frame.locator('#vhomeGabinetHeader');
  await header.getByRole('button', { name: 'Rozpocznij nową wizytę', exact: true }).click();
  await expect(header.getByRole('button', { name: 'Zapisz wizytę', exact: true })).toBeVisible();
  // A visit can start without measurements. Its form grid is visible immediately.
  await expect(frame.locator('#weight')).toHaveValue('');
  for (const width of [1440, 390]) await checkPatientLayout(width, frame.locator('#calcForm'));
  await overview.click();
  await frame.locator('#vhomePatientOverview select.vhome-b1-mobile-select').selectOption('reminders');
  const slot = frame.locator('#vhomePatientRemindersSlot');
  await expect(slot).toContainText('Fikcyjne przypomnienie gabinetowe a');
  await expect(slot).not.toContainText('Fikcyjne przypomnienie gabinetowe b');
  await expect(frame.locator('#remindersInline')).toHaveCount(1);
});

async function saveReminderOnly(page) {
  const { frame, ids } = await prepare(page);
  const before = await frame.evaluate(id => window.VildaVault.getPatient(id), ids.a);
  await choosePatient(frame, 'Antoni');
  const header = frame.locator('#vhomeGabinetHeader');
  await header.getByRole('button', { name: 'Rozpocznij nową wizytę', exact: true }).click();
  const save = header.getByRole('button', { name: 'Zapisz wizytę', exact: true });
  await expect(save).toBeVisible();
  const visit = await frame.evaluate(() => window.collectUserData().visit);
  expect(visit).toMatchObject({ patientId: ids.a, origin: 'explicit' });
  expect(visit.visitId).toBeTruthy();
  await expect(frame.locator('#weight')).toHaveValue('');
  await expect(frame.locator('#height')).toHaveValue('');

  const workspace = frame.locator('#vhomePatientOverview');
  await workspace.getByRole('tab', { name: 'Przypomnienia', exact: true }).click();
  const trigger = frame.locator('#vhomePatientRemindersSlot').getByRole('button', { name: 'Dodaj przypomnienie', exact: true });
  await trigger.click();
  const dialog = page.locator('dialog.vhome-reminders-dialog');
  const text = 'Fikcyjna kontrola wizyta bez pomiaru';
  await dialog.getByLabel('Treść przypomnienia', { exact: true }).fill(text);
  const date = new Date().toISOString().slice(0, 10);
  await dialog.getByLabel('Przypomnij w dniu', { exact: true }).fill(date);
  await dialog.getByRole('button', { name: 'Zapisz przypomnienie', exact: true }).click();
  await expect.poll(() => frame.evaluate(async ({ id, text }) => {
    const notes = await window.VildaVault.listPatientNotesForPatient(id);
    return notes.find(note => note.title === text)?.visitContext?.visitId;
  }, { id: ids.a, text })).toBe(visit.visitId);
  if (await dialog.isVisible()) {
    await dialog.getByRole('button', { name: 'Zamknij Przypomnienia', exact: true }).click();
  }
  const revisions = () => frame.evaluate(async ({ id, visitId }) => {
    const patient = await window.VildaVault.getPatient(id);
    return patient.snapshots.filter(snapshot => snapshot.payload?.visit?.visitId === visitId).length;
  }, { id: ids.a, visitId: visit.visitId });
  await expect.poll(revisions).toBe(1);
  return { frame, ids, before, save, text, visit, revisions };
}

test('a consultation containing only a reminder saves its own visit and leaves the previous measurements intact', async ({ page }) => {
  const { frame, ids, before, text, visit, revisions } = await saveReminderOnly(page);
  const save = page.locator('#saveDataBtnSidebar');
  await expect(save).toHaveAccessibleName('Zapisz wizytę');
  await save.click();
  await expect(frame.locator('#vhomeGabinetHeader').getByRole('button', { name: 'Rozpocznij nową wizytę', exact: true })).toBeVisible();
  expect(await revisions()).toBe(1);

  await page.reload({ waitUntil: 'load' });
  const restored = await shellFrame(page);
  await restored.waitForFunction(() => window.VildaVault?.isUnlocked() && window.VildaAuthUI?.isBootReady());
  await expect.poll(() => restored.evaluate(async ({ id, text }) => {
    const records = await window.VildaVault.listPatientNotesForPatient(id);
    return records.find(note => note.title === text)?.visitContext?.visitId || '';
  }, { id: ids.a, text })).toBe(visit.visitId);
  const after = await restored.evaluate(id => window.VildaVault.getPatient(id), ids.a);
  const saved = after.snapshots.find(snapshot => snapshot.payload?.visit?.visitId === visit.visitId);
  expect(Number(saved.payload.user.height || 0)).toBe(0);
  expect(Number(saved.payload.user.weight || 0)).toBe(0);
  for (const previous of before.snapshots) {
    const original = after.snapshots.find(row => row.snapshotId === previous.snapshotId);
    expect(original?.payload.user).toEqual(previous.payload.user);
    expect(original?.payload.visit).toEqual(previous.payload.visit);
  }
  expect(await restored.evaluate(async ({ id, text }) =>
    (await window.VildaVault.listPatientNotesForPatient(id)).some(note => note.title === text),
  { id: ids.b, text })).toBe(false);
});

test('reloading right after saving a reminder keeps its measurement-free visit in history', async ({ page }) => {
  const { ids, visit, text } = await saveReminderOnly(page);
  await page.reload({ waitUntil: 'load' });
  const frame = await shellFrame(page);
  await frame.waitForFunction(() => window.VildaVault?.isUnlocked() && window.VildaAuthUI?.isBootReady());
  const saved = await frame.evaluate(async ({ id, visitId, text }) => {
    const visits = await window.VildaVault.getPatientVisits(id);
    const notes = await window.VildaVault.listPatientNotesForPatient(id);
    return { visits: visits.filter(row => row.visitId === visitId).length,
      reminderVisit: notes.find(row => row.title === text)?.visitContext?.visitId };
  }, { id: ids.a, visitId: visit.visitId, text });
  expect(saved).toEqual({ visits: 1, reminderVisit: visit.visitId });
});

test('Edytuj wizytę corrects only the chosen historical record and returns to the latest patient overview', async ({ page }) => {
  const { frame, ids } = await prepare(page);
  const seed = await frame.evaluate(async patientId => {
    const vault = window.VildaVault;
    const [older] = await vault.getPatientVisits(patientId);
    const date = '2026-11-21';
    for (const weight of [54, 55]) {
      const visit = structuredClone(older.payload);
      visit.visit = window.VildaVisitContext.create({ patientId, clinicalDateISO: date });
      visit.user = { ...visit.user, measuredAtISO: date, weight, height: 160 };
      await vault.savePatient(visit, { patientId, dedup: false });
    }
    const [latest, earlierToday] = await vault.getPatientVisits(patientId);
    return { latestId: latest.visitId, latestSnapshot: latest.snapshotId,
      targetId: earlierToday.visitId, targetSnapshot: earlierToday.snapshotId, revision: earlierToday.rev };
  }, ids.a);
  await choosePatient(frame, 'Antoni');
  const header = frame.locator('#vhomeGabinetHeader');
  const patientCard = frame.locator('#vhomePatientOverview > .vilda-auth-card');
  const notesTab = patientCard.getByRole('tab', { name: 'Notatki', exact: true });
  const addNote = patientCard.getByRole('button', { name: /Dodaj notatkę/ });
  await notesTab.click();
  await expect(addNote).toBeVisible();
  const trigger = header.getByRole('button', { name: 'Historia wizyt' });
  await trigger.click();
  const history = frame.locator('#vhomeVisitHistory');
  const title = history.getByRole('heading', { name: 'Wizyty pacjenta' });
  await expect(title).toBeVisible();
  await expect(patientCard).toBeHidden();
  await history.getByRole('button', { name: 'Wróć do przeglądu' }).click();
  await expect(notesTab).toHaveAttribute('aria-selected', 'true');
  await expect(addNote).toBeVisible();
  await expect(trigger).toBeFocused();
  await trigger.click();
  const detail = frame.locator('dialog.vhome-history-detail');
  const rail = history.getByRole('tablist');
  const selected = rail.getByRole('tab', { selected: true });
  await expect(title).toBeVisible();
  await expect(rail.getByRole('tab')).toHaveCount(3);
  await expect(selected).toHaveAttribute('data-visit-id', seed.latestId);
  const raisedPaper = history.locator('.vhs-paper[data-active]');
  await expect(raisedPaper).toHaveAttribute('data-visit-id', seed.latestId);
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await expect(raisedPaper).toHaveCSS('transition-duration', '0.3s');
  const papers = await history.locator('.vhs-paper').evaluateAll(nodes => nodes.map(node => {
    const { x, width } = node.getBoundingClientRect();
    return { center: x + width / 2, width };
  }));
  expect(papers[0].center).toBeLessThan(papers[1].center);
  expect(papers[1].center).toBeLessThan(papers[2].center);
  expect(papers[0].width).toBeGreaterThan(papers[2].width);
  await selected.press('ArrowRight');
  await expect(selected).toHaveAttribute('data-visit-id', seed.targetId);
  await expect(raisedPaper).toHaveAttribute('data-visit-id', seed.targetId);
  await expect(detail).toBeHidden();
  await expect(frame.locator('#weight')).toHaveValue('55');
  const open = history.getByRole('button', { name: 'Otwórz podgląd wizyty' });
  await open.click();
  await expect(detail).toBeVisible();
  await detail.getByRole('button', { name: 'Nowsza wizyta' }).click();
  await expect(detail.getByRole('button', { name: 'Nowsza wizyta' })).toBeDisabled();
  await detail.getByRole('button', { name: 'Starsza wizyta' }).click();
  await detail.press('Escape');
  await expect(open).toBeFocused();
  await expect(selected).toHaveAttribute('data-visit-id', seed.targetId);
  await history.getByRole('button', { name: 'Lista', exact: true }).click();
  await history.locator(`.vhs-list button[data-visit-id="${seed.targetId}"]`).click();
  await detail.getByRole('button', { name: 'Edytuj wizytę' }).click();
  await expect(header).toContainText('Edycja wizyty', { timeout: 15_000 });
  await header.getByRole('tab', { name: 'Analiza', exact: true }).click();
  await expect(frame.locator('#weight')).toHaveValue('54');
  await frame.locator('#weight').fill('44');
  await frame.locator('#weight').press('Control+s');
  // Browse mode returns after the native save and reload of the latest visit.
  await expect(header.getByRole('button', { name: 'Rozpocznij nową wizytę', exact: true })).toBeVisible({ timeout: 30_000 });
  const saved = await frame.evaluate(async ({ pid, snapshotId }) => {
    const patient = await window.VildaVault.getPatient(pid);
    const edited = patient.snapshots.find(item => item.snapshotId === snapshotId);
    return [patient.snapshots[0].snapshotId, edited.rev, edited.payload.user.weight];
  }, { pid: ids.a, snapshotId: seed.targetSnapshot });
  expect(saved).toEqual([seed.latestSnapshot, seed.revision + 1, 44]);
  await expect(frame.locator('#weight')).toHaveValue('55');
});

test('comparison follows clinical visit dates, offers an explicit measured baseline and corrects only the chosen visit', async ({ page }) => {
  const { frame } = await prepare(page);
  const adult = fictionalPatient({ firstName: 'Łucja', sex: 'F', age: 46, height: null, weight: 94 });
  const seed = await frame.evaluate(async ({ version, name, user }) => {
    const vault = window.VildaVault;
    const record = { version, name, user: { ...user, measuredAtISO: '2025-09-18' } };
    const { patientId } = await vault.savePatient(record, { dedup: false });
    // The blank October consultation is imported last, after the November visit.
    for (const [day, weight] of [['2025-11-15', 91.5], ['2025-10-12', null]]) {
      const payload = { ...record, visit: window.VildaVisitContext.create({ patientId, clinicalDateISO: day }),
        user: { ...record.user, measuredAtISO: weight === null ? null : day, weight } };
      await vault.savePatient(payload, { patientId, dedup: false });
    }
    const [november, october, september] = await vault.getPatientVisits(patientId);
    const technical = (await vault.getPatient(patientId)).snapshots[0];
    return { patientId, november: november.visitId, october: october.visitId, september: september.visitId,
      octoberRevision: october.rev, lastSaved: technical.payload.visit.visitId };
  }, adult);
  expect(seed.lastSaved).toBe(seed.october);
  await choosePatient(frame, 'Łucja');
  const header = frame.locator('#vhomeGabinetHeader');
  const analysis = header.getByRole('tab', { name: 'Analiza', exact: true });
  const card = frame.locator('#vhomeVisitComparison');
  const weight = frame.locator('#weight'), metric = card.locator('[data-comparison-metric="weight"]');
  const date = header.getByRole('button', { name: 'Otwórz wizytę z 15.11.2025', exact: true });
  const visitIds = () => frame.evaluate(async patientId =>
    (await window.VildaVault.getPatientVisits(patientId)).map(row => row.visitId), seed.patientId);
  await expect(date).toBeVisible();
  await analysis.click();
  await expect(weight).toHaveValue('91.5');
  await expect(weight).not.toBeEditable();
  await expect(card.getByRole('heading', { name: 'Zmiana od poprzedniej wizyty' })).toBeVisible();
  await expect(card).toContainText('12.10.2025');
  await expect(card).toContainText('15.11.2025');
  await card.getByRole('button', { name: 'Porównaj z pomiarem z 18.09.2025' }).click();
  await expect(metric).toContainText(/[-−]\s*2,5/);
  await expect(metric).toContainText('94');
  await expect(metric).toContainText('91,5');
  await expect(card.locator('[data-comparison-metric="bmi"]').filter({ hasText: /\d/ })).toHaveCount(0);
  await card.getByRole('button', { name: 'Szczegóły porównania' }).click();
  const modal = frame.locator('#vhomeVisitComparisonDialog');
  await expect(modal).toBeVisible();
  await expect(modal).toContainText('18.09.2025');
  await expect(modal).toContainText('15.11.2025');
  await modal.press('Escape');
  await expect(modal).toBeHidden();
  await card.getByRole('button', { name: 'Wróć do poprzedniej wizyty' }).click();
  await expect(card).toContainText('12.10.2025');
  expect(await visitIds()).toEqual([seed.november, seed.october, seed.september]);

  await date.click();
  const sheet = frame.locator('#vhomeVisitDetail');
  const novemberHeading = sheet.getByRole('heading', { name: 'Wizyta z 15.11.2025', exact: true });
  await expect(novemberHeading).toBeVisible();
  await sheet.getByRole('button', { name: 'Zamknij podgląd wizyty', exact: true }).click();
  await expect(analysis).toHaveAttribute('aria-selected', 'true');
  await expect(date).toBeFocused();
  await date.click();
  await expect(novemberHeading).toBeVisible();
  await sheet.getByRole('button', { name: 'Starsza wizyta', exact: true }).click();
  await expect(sheet.getByRole('heading', { name: 'Wizyta z 12.10.2025', exact: true })).toBeVisible();
  await sheet.getByRole('button', { name: 'Edytuj wizytę', exact: true }).click();
  await expect(header).toContainText('Edycja wizyty', { timeout: 15_000 });
  await analysis.click();
  await expect(weight).toBeEditable();
  await expect(weight).toHaveValue('');
  await weight.fill('92.5');
  await expect(card).toContainText('18.09.2025');
  await expect(card).not.toContainText('15.11.2025');
  await expect(metric).toContainText(/[-−]\s*1,5/);
  await header.getByRole('button', { name: 'Zapisz zmiany', exact: true }).click();
  await expect(date).toBeVisible();
  await expect(weight).toHaveValue('91.5');
  await analysis.click();
  await expect(weight).not.toBeEditable();
  await expect(card).toContainText('12.10.2025');
  await expect(metric).toContainText('92,5');
  await expect(metric).toContainText(/[-−]\s*1(?:,0)?(?:\s|$)/);
  const values = await frame.evaluate(async patientId =>
    (await window.VildaVault.getPatientVisits(patientId)).map(row =>
      ({ visitId: row.visitId, weight: row.payload.user.weight, revision: row.rev, measured: row.payload.user.measuredAtISO || null })), seed.patientId);
  expect(values.map(row => [row.visitId, row.weight])).toEqual([
    [seed.november, 91.5], [seed.october, 92.5], [seed.september, 94],
  ]);
  expect(values[1].revision).toBe(seed.octoberRevision + 1);
  // The date of this measurement was unknown when the visit was recorded.
  expect(values[1].measured).toBeNull();
});

test('browsing visit history from Analysis on a phone preserves the open visit and its unsaved measurements', async ({ page }) => {
  const { frame, ids } = await prepare(page);
  const notes = { archived: 'Notatka z fikcyjnej wizyty', general: 'Notatka ogólna Antoniego', other: 'Notatka ogólna Beaty' };
  await frame.evaluate(async ({ ids, notes }) => {
    const vault = window.VildaVault;
    const [archived] = await vault.getPatientVisits(ids.a);
    await vault.savePatientNote({ patientId: ids.a, category: 'observation', title: notes.archived,
      visitContext: { version: 1, visitId: archived.visitId, clinicalDateISO: archived.clinicalDateISO } });
    await vault.savePatientNote({ patientId: ids.a, category: 'observation', title: notes.general });
    await vault.savePatientNote({ patientId: ids.b, category: 'observation', title: notes.other });
  }, { ids, notes });
  await page.setViewportSize({ width: 390, height: 844 });
  await choosePatient(frame, 'Antoni');
  const header = frame.locator('#vhomeGabinetHeader');
  await header.getByRole('button', { name: 'Rozpocznij nową wizytę' }).click();
  await expect(header.getByRole('button', { name: 'Zapisz wizytę' })).toBeVisible();
  const analysis = header.getByRole('tab', { name: 'Analiza', exact: true });
  await analysis.click();
  await frame.locator('#height').fill('159');
  await frame.locator('#weight').fill('49');
  const patientState = () => frame.evaluate(async patientId => ({
    encounter: window.VildaHomeEncounter.state(patientId),
    snapshots: (await window.VildaVault.getPatient(patientId)).snapshots.map(row => [row.snapshotId, row.rev]),
  }), ids.a);
  const before = await patientState();
  expect(before.encounter.mode).toBe('new');
  const trigger = header.getByRole('button', { name: 'Historia wizyt' });
  await trigger.click();
  const history = frame.locator('#vhomeVisitHistory');
  await expect(history.getByRole('tab')).toHaveCount(1);
  await expect(history.locator('.vhs-paper[data-active]')).toHaveCSS('transition-duration', '0s');
  await history.getByRole('button', { name: 'Otwórz podgląd wizyty' }).click();
  const detail = frame.locator('dialog.vhome-history-detail');
  await expect(detail.getByRole('tabpanel', { name: 'Wyniki', exact: true })).toContainText('46 kg');
  await expect(detail).toContainText(notes.archived);
  await expect(detail).not.toContainText(notes.general);
  await detail.getByRole('tab', { name: 'Siatka centylowa' }).click();
  await expect(detail.getByRole('tabpanel', { name: 'Siatka centylowa' }).locator('svg')).toBeVisible();
  await detail.getByRole('tab', { name: 'Porównanie' }).click();
  const comparison = detail.getByRole('row', { name: /Masa ciała/ });
  await expect(comparison.getByRole('cell').first()).toHaveText('46 kg');
  await expect(comparison.getByRole('cell').last()).toContainText('49 kg');
  await detail.getByRole('tab', { name: 'Informacje ogólne' }).click();
  const general = detail.getByRole('tabpanel', { name: 'Informacje ogólne' });
  await expect(general).toContainText(notes.general);
  await expect(general).not.toContainText(notes.archived);
  await expect(general).not.toContainText(notes.other);
  await detail.getByRole('button', { name: 'Zamknij podgląd wizyty' }).click();
  await history.getByRole('button', { name: /^Wróć/ }).click();
  await expect(history).toBeHidden();
  await expect(analysis).toHaveAttribute('aria-selected', 'true');
  await expect(trigger).toBeFocused();
  await expect(frame.locator('#height')).toHaveValue('159');
  await expect(frame.locator('#weight')).toHaveValue('49');
  expect(await patientState()).toEqual(before);

  const clear = frame.locator('#clearAllDataBtn');
  await expect(clear).toContainText('Wróć do Gabinetu');
  await clear.click();
  const warning = frame.locator('.vug[role="dialog"]');
  await warning.getByRole('button', { name: /^Odrzuć (dane|zmiany) i wyczyść$/ }).click();
  await expect(frame.locator('#vhomeGabinetStart')).toBeVisible();
  expect((await patientState()).snapshots).toEqual(before.snapshots);
});

test('a new note in Overview keeps the active encounter and an independent clinical date', async ({ page }) => {
  const { frame, ids } = await prepare(page);
  await choosePatient(frame,'Antoni');
  const header = frame.locator('#vhomeGabinetHeader');
  await header.getByRole('button',{name:'Rozpocznij nową wizytę',exact:true}).click();
  await expect(header.getByRole('button',{name:'Zapisz wizytę',exact:true})).toBeVisible();
  const visit = await frame.evaluate(() => window.collectUserData().visit);
  const overview = frame.locator('#vhomePatientOverview');
  await overview.getByRole('tab',{name:'Notatki',exact:true}).click();
  await overview.getByRole('button',{name:/Dodaj notatkę/}).click();
  const editor = frame.locator('.vilda-patient-note-editor-overlay');
  await expect(editor).toBeVisible();
  await expect(editor.locator('[name="b3-anchor"]')).toHaveCount(0);
  const title = 'Fikcyjny wpis z przypisanej wizyty';
  await editor.getByPlaceholder('np. Wprowadzono Euthyrox').fill(title);
  await editor.locator('textarea').first().fill('Treść kontrolna end-to-end.');
  await editor.getByLabel('Data badania lub zdarzenia (opcjonalnie)').fill('2025-12-19');
  await editor.getByRole('button',{name:'Dodaj notatkę',exact:true}).click();
  await expect(editor).toHaveCount(0);
  const saved = await frame.evaluate(async ({patientId,title}) =>
    (await window.VildaVault.listPatientNotesForPatient(patientId)).find(note => note.title === title), {patientId:ids.a,title});
  expect(saved).toMatchObject({clinicalDateISO:'2025-12-19',visitContext:{
    version:1,visitId:visit.visitId,clinicalDateISO:visit.clinicalDateISO
  }});
});

test('the native patient card starts a full visit and the embedded card keeps one start action', async ({ page }) => {
  const { frame, ids } = await prepare(page);
  await choosePatient(frame, 'Antoni');
  const overview = frame.locator('#vhomePatientOverview');
  await overview.getByRole('button', { name: /Działania/ }).click();
  const inlineMenu = overview.getByRole('menu');
  await expect(inlineMenu.getByRole('menuitem', { name: /Nowy pomiar|Rozpocznij nową wizytę/ })).toHaveCount(0);
  await expect(inlineMenu.getByRole('menuitem', { name: 'Historia wersji', exact: true })).toBeVisible();
  await inlineMenu.press('Escape');
  const header = frame.locator('#vhomeGabinetHeader');
  await header.getByRole('tab', { name: 'Analiza' }).click();
  await frame.evaluate(id => window.VildaAuthUI.showPatientCard(id, null, { homePatientPresentation: true }), ids.a);
  const full = frame.locator('.vilda-auth-card[role="dialog"]:has(.vhome-native-patient-card)');
  await full.getByRole('button', { name: /Działania/ }).click();
  await full.getByRole('menuitem', { name: 'Rozpocznij nową wizytę', exact: true }).click();
  await expect(full).toBeHidden();
  await expect(header.getByRole('button', { name: 'Zapisz wizytę', exact: true })).toBeVisible();
  await expect(frame.locator('#vildaLoadChoiceModal')).toBeHidden();
  await expect(frame.locator('.vilda-quick-measure-overlay')).toHaveCount(0);
  await expect(frame.locator('#height')).toHaveValue('');
  await expect(frame.locator('#weight')).toHaveValue('');
  expect(await frame.evaluate(id => window.VildaHomeEncounter.state(id).mode, ids.a)).toBe('new');
});

async function openDocProForVisit(page) {
  const menu = await visibleChromeMenu(page);
  await menu.locator('a[href="docpro.html"]').click();
  const docpro = await shellFrame(page, 'DocPro');
  await readyForPatient(docpro);
  const confirm = docpro.locator('#professionalConfirmBtn');
  if (await confirm.isVisible()) await confirm.click();
  await expect.poll(() => docpro.evaluate(() => window.VildaDataImportExport.getHomeVisitSaveAction().reason)).toBe(null);
  return docpro;
}

test('mobile DocPro saves its own changed form into the open visit', async ({ page }) => {
  const { frame, ids } = await prepare(page);
  await choosePatient(frame, 'Antoni');
  const header = frame.locator('#vhomeGabinetHeader');
  await header.getByRole('button', { name: 'Rozpocznij nową wizytę' }).click();
  await expect(header.getByRole('button', { name: 'Zapisz wizytę' })).toBeVisible();
  await header.getByRole('tab', { name: 'Analiza', exact: true }).click();
  await frame.locator('#height').fill('159');
  await frame.locator('#weight').fill('43');
  const visitId = await frame.evaluate(id => window.VildaHomeEncounter.state(id).visitId, ids.a);
  const before = await frame.evaluate(async id => (await window.VildaVault.getPatient(id)).snapshots.map(row => row.snapshotId), ids.a);
  await page.setViewportSize({ width: 390, height: 844 });
  const docpro = await openDocProForVisit(page);
  await expect(docpro.locator('#weight')).toHaveValue('43');
  await docpro.locator('#weight').fill('44');
  const drawer = await visibleChromeMenu(page);
  await drawer.getByRole('button', { name: 'Zapisz wizytę', exact: true }).click();
  await expect.poll(() => docpro.evaluate(async ({ id, visitId }) => {
    const rows = (await window.VildaVault.getPatient(id)).snapshots;
    return rows.filter(row => row.payload.visit?.visitId === visitId).map(row => [row.payload.user.height, row.payload.user.weight]);
  }, { id: ids.a, visitId })).toEqual([[159, 44]]);
  await expect.poll(() => frame.evaluate(id => window.VildaHomeEncounter.state(id).mode, ids.a)).toBe('browse');
  const preserved = await frame.evaluate(async ({ id, before }) => (await window.VildaVault.getPatient(id)).snapshots
    .filter(row => before.includes(row.snapshotId)).map(row => row.snapshotId), { id: ids.a, before });
  expect(preserved).toEqual(before);
});

test('DocPro corrects the chosen historical visit and returns to the current patient overview', async ({ page }) => {
  const { frame, ids } = await prepare(page);
  const target = await frame.evaluate(async id => {
    const vault = window.VildaVault, [earlier] = await vault.getPatientVisits(id);
    const next = structuredClone(earlier.payload);
    next.visit = window.VildaVisitContext.create({ patientId: id, clinicalDateISO: '2026-10-16' });
    next.user = { ...next.user, measuredAtISO: '2026-10-16', weight: 58, height: 160 };
    await vault.savePatient(next, { patientId: id, dedup: false });
    return { snapshotId: earlier.snapshotId, visitId: earlier.visitId, rev: earlier.rev };
  }, ids.a);
  await choosePatient(frame, 'Antoni');
  const header = frame.locator('#vhomeGabinetHeader');
  await header.getByRole('button', { name: 'Otwórz wizytę z 16.10.2026', exact: true }).click();
  const sheet = frame.locator('#vhomeVisitDetail');
  await sheet.getByRole('button', { name: 'Starsza wizyta', exact: true }).click();
  await expect(sheet.getByRole('heading', { name: 'Wizyta z 17.06.2026', exact: true })).toBeVisible();
  await sheet.getByRole('button', { name: 'Edytuj wizytę', exact: true }).click();
  await expect(header.getByRole('button', { name: 'Zapisz zmiany', exact: true })).toBeEnabled({ timeout: 15_000 });
  const docpro = await openDocProForVisit(page);
  await docpro.locator('#weight').fill('47');
  await docpro.locator('#weight').press('Meta+s');
  await expect.poll(() => docpro.evaluate(async ({ id, target }) => {
    const rows = (await window.VildaVault.getPatient(id)).snapshots;
    const corrected = rows.find(row => row.snapshotId === target.snapshotId);
    return [rows[0].payload.user.weight, corrected.payload.user.weight, corrected.rev];
  }, { id: ids.a, target })).toEqual([58, 47, target.rev + 1]);
  await expect(page.locator('iframe.app-pane[title="Start"]')).toBeVisible({ timeout: 15_000 });
  await expect(frame.locator('#vhomeGabinetOverviewTab')).toHaveAttribute('aria-selected', 'true', { timeout: 15_000 });
  await expect(frame.locator('#weight')).toHaveValue('58', { timeout: 15_000 });
});

test('a saved consultation without measurements stays read-only until a new visit is opened', async ({ page }) => {
  const { frame, ids } = await prepare(page);
  await choosePatient(frame, 'Antoni');
  const header = frame.locator('#vhomeGabinetHeader');
  await header.getByRole('button', { name: 'Rozpocznij nową wizytę' }).click();
  await header.getByRole('button', { name: 'Zapisz wizytę' }).click();
  await expect(header.getByRole('button', { name: 'Rozpocznij nową wizytę' })).toBeVisible();
  const decision = () => frame.evaluate(() => {
    const state = window.VildaSaveStatusIndicator.getCurrentDecision();
    return state.ready ? state.state : 'pending';
  });
  await expect.poll(decision).toBe('saved');
  const persisted = await frame.evaluate(async id => {
    const [latest] = await window.VildaVault.getPatientVisits(id);
    return { date: latest.clinicalDateISO, measured: latest.payload.user.measuredAtISO || null };
  }, ids.a);
  expect(persisted.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  expect(persisted.measured).toBeNull();

  await header.getByRole('tab', { name: 'Analiza', exact: true }).click();
  const weight = frame.locator('#weight');
  await expect(weight).not.toBeEditable();
  await expect(frame.locator('#height')).not.toBeEditable();
  await expect(weight).toHaveValue('');
  await expect(header).toContainText('Ostatnia wizyta');
  expect(await decision()).toBe('saved');

  await frame.locator('#vhomeGrowthExpand').click();
  const growth = frame.getByRole('dialog', { name: 'Zaawansowane obliczenia wzrostowe', exact: true });
  await growth.getByRole('tab', { name: 'Dane i pomiary', exact: true }).click();
  await expect(growth.locator('[data-growth-field="advMotherHeight"]')).toBeDisabled();
  await page.keyboard.press('Escape');
  await expect(growth).toBeHidden();
  await frame.locator('#tannerToggleBtn').click();
  const puberty = frame.getByRole('dialog', { name: 'Dane pokwitaniowe', exact: true });
  await expect(puberty.locator('[data-puberty-select-axis]').first()).toBeDisabled();
  await page.keyboard.press('Escape');
  await expect(puberty).toBeHidden();

  await header.getByRole('button', { name: 'Rozpocznij nową wizytę', exact: true }).click();
  await expect(header).toContainText('Nowa wizyta');
  await expect(weight).toBeEditable();
  await weight.fill('43');
  await expect.poll(decision).toBe('dirty');
  await frame.locator('#clearAllDataBtn').click();
  const guard = frame.locator('.vug[role="dialog"]');
  await expect(guard).toBeVisible();
  await guard.getByRole('button', { name: 'Anuluj', exact: true }).click();
  await expect(weight).toHaveValue('43');
  const after = await frame.evaluate(id => window.VildaVault.getPatientVisits(id), ids.a);
  expect(after[0].clinicalDateISO).toBe(persisted.date);
  expect(after[0].payload.user.weight || null).toBeNull();
});
