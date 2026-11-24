import { expect, test } from '@playwright/test';
import { visibleChromeMenu } from '../support/chrome-menu-fixture.mjs';
import { fictionalPatient, readyForPatient, shellFrame } from '../support/centile-live-fixture.mjs';
import { prepareGabinet as prepare, choosePatient } from '../support/gabinet-patient-fixture.mjs';

test.use({ serviceWorkers: 'block', contextOptions: { reducedMotion: 'reduce' } });
test.setTimeout(180_000);

async function openHistoryFromHeader(header) {
  await header.getByRole('button', { name: 'Opcje', exact: true }).click();
  await header.getByRole('button', { name: 'Historia wizyt', exact: true }).click();
}

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
  await expect(header.getByRole('button', { name: 'Opcje', exact: true })).toHaveCSS('background-color', 'rgb(255, 255, 255)');
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
  await expect.poll(() => frame.locator('.site-footer').evaluate(async footer => {
    const scroller = document.scrollingElement;
    scroller.scrollTo({ top: scroller.scrollHeight, behavior: 'instant' });
    await new Promise(resolve => { requestAnimationFrame(resolve); });
    const { top, bottom } = footer.getBoundingClientRect();
    return {
      atEnd: Math.abs(scroller.scrollHeight - scroller.clientHeight - scroller.scrollTop) <= 1,
      footerInView: top >= -0.5 && bottom <= innerHeight + 0.5,
      enoughScroll: scroller.scrollTop > 100,
    };
  }), { message: 'Stopka przy rzeczywistym końcu przewijania · ' + screen }).toEqual(expect.objectContaining({
    atEnd: true, footerInView: true, ...(requireOverflow ? { enoughScroll: true } : {}),
  }));
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
    await expect(start.getByRole('heading', { name: 'Gabinet', exact: true })).toBeFocused();
    const search = start.getByRole('searchbox');
    await expect(search).not.toBeFocused();
    await expect(start.locator('#vgs-results')).toBeHidden();
    await expect(start.getByRole('button', { name: 'Lista pacjentów', exact: true })).toHaveAttribute('aria-expanded', 'false');
    await search.click();
    await expect(search).toBeFocused();
    await expect(start.locator('.vgs-office-grid')).toBeVisible();
    await checkScroll('Gabinet', width < 500);
    await choosePatient(frame, 'Antoni');
    await expect(frame.locator('#vhomePatientOverview .vhome-native-patient-card')).toBeVisible();
    await checkScroll('Przegląd', false, patientBack);
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

test.describe('touch footer navigation', () => {
  test.use({ hasTouch: true });

  test('mobile Gabinet replaces the floating arrow with an inline return that preserves the active visit', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 480 });
    const { frame, ids } = await prepare(page);
    await page.setViewportSize({ width: 390, height: 480 });
    const header = frame.locator('#vhomeGabinetHeader');
    if (await header.isVisible()) await header.locator('[data-start]').click();
    const entryBack = frame.locator('#gbEntryHeader').getByRole('button', { name: 'Ekran startowy' });
    if (await entryBack.isVisible()) await entryBack.click();
    await expect(frame.locator('#vhomeGabinetStart [data-entry="office"]')).toBeVisible();
    const inline = frame.locator('button[data-vilda-footer-scroll-top]');
    const legacy = page.locator('#appShellScrollTop');
    await scrollToVisibleFooter(frame, 'Mobilny Start bez powrotu na górę');
    await expect(inline).toBeHidden();
    await expect(legacy).toBeHidden();
    await expect(frame.locator('#scrollTopBtn')).toBeHidden();

    await choosePatient(frame, 'Antoni');
    await header.getByRole('button', { name: 'Nowa wizyta', exact: true }).click();
    const analysis = frame.locator('#vhomeGabinetAnalysisTab');
    await analysis.click();
    await expect(analysis).toHaveAttribute('aria-selected', 'true');
    await frame.locator('#height').fill('159');
    await frame.locator('#weight').fill('43');
    const toggle = frame.locator('#vhomeOtherToolsToggle');
    if (await toggle.getAttribute('aria-expanded') === 'false') await toggle.click();
    const lastTool = frame.locator('#vhomeOtherToolsGrid [data-home-tool]:enabled').last();
    await expect(lastTool).toContainText('Szacowane spożycie energii');
    const visitState = () => frame.evaluate(id => {
      const state = window.VildaHomeEncounter.state(id);
      return {
        patientId: sessionStorage.getItem('vildaCurrentPatientId'),
        visitId: state?.visitId ?? null, mode: state?.mode ?? null,
        height: document.getElementById('height').value, weight: document.getElementById('weight').value,
        age: document.getElementById('age').value, sex: document.getElementById('sex').value,
        screen: document.querySelector('.main-content').dataset.vhomeScreen,
        analysis: document.getElementById('vhomeGabinetAnalysisTab').getAttribute('aria-selected'),
        tools: document.getElementById('vhomeOtherToolsToggle').getAttribute('aria-expanded'),
      };
    }, ids.a);
    const before = await visitState();
    expect(before.patientId).toBe(ids.a);
    expect(before.screen).toBe('analysis');
    expect(before.mode).toBe('new');

    // Check the tile at the viewport edge where the old FAB covered it.
    // The outer hit-test also detects controls painted above a same-origin iframe.
    await lastTool.evaluate(node => node.scrollIntoView({ block: 'end', behavior: 'instant' }));
    const visibleBottom = await page.evaluate(() => {
      const dock = document.getElementById('mobileBottomDock');
      const box = dock?.getBoundingClientRect();
      return (box?.height && box.top > 0 && box.top < innerHeight ? box.top : innerHeight) - 8;
    });
    const frameTop = (await page.locator('iframe.app-pane[title="Start"]').boundingBox()).y;
    // Respect the visible dock without hiding it: the old FAB sat above this edge.
    await lastTool.evaluate((node, bottom) => window.scrollBy({
      top: Math.max(0, node.getBoundingClientRect().bottom - bottom), behavior: 'instant',
    }), visibleBottom - frameTop);
    await expect.poll(() => lastTool.evaluate(node => {
      const { left, right, top, bottom } = node.getBoundingClientRect();
      return [left + 12, (left + right) / 2, right - 12].flatMap(x =>
        [top + 12, (top + bottom) / 2, bottom - 12].map(y => ({
          x, y, hit: x >= 0 && y >= 0 && x < innerWidth && y < innerHeight &&
            node.contains(document.elementFromPoint(x, y)),
        })));
    })).toEqual(Array.from({ length: 9 }, () => expect.objectContaining({ hit: true })));
    const points = await lastTool.evaluate(node => {
      const { left, right, top, bottom } = node.getBoundingClientRect();
      return [left + 12, (left + right) / 2, right - 12].flatMap(x =>
        [top + 12, (top + bottom) / 2, bottom - 12].map(y => ({ x, y })));
    });
    await expect.poll(() => page.locator('iframe.app-pane[title="Start"]').evaluate((iframe, points) => {
      const rect = iframe.getBoundingClientRect();
      return points.map(({ x, y }) => iframe === document.elementFromPoint(
        rect.left + x * rect.width / iframe.clientWidth,
        rect.top + y * rect.height / iframe.clientHeight));
    }, points)).toEqual(Array(9).fill(true));
    await expect(legacy).toBeHidden();
    await expect(frame.locator('#scrollTopBtn')).toBeHidden();

    await scrollToVisibleFooter(frame, 'Mobilny powrót z Analizy', true);
    await expect(inline).toHaveAccessibleName('Wróć na górę');
    await expect(inline).toBeInViewport({ ratio: 1 });
    expect(await inline.evaluate(node => Boolean(node.closest('.site-footer')))).toBe(true);
    expect(['static', 'relative']).toContain(await inline.evaluate(node => getComputedStyle(node).position));
    await expect.poll(() => hitTestPositions(inline)).toEqual([expect.objectContaining({ visible: true })]);
    await inline.tap();
    await expect.poll(() => frame.evaluate(() => document.scrollingElement.scrollTop)).toBe(0);
    expect(await visitState()).toEqual(before);
    expect(await page.evaluate(() => window.scrollY)).toBe(0);

    // Desktop keeps the existing floating control instead of the mobile footer action.
    await page.setViewportSize({ width: 1440, height: 600 });
    await scrollToVisibleFooter(frame, 'Dotychczasowa strzałka desktop', true);
    await expect(inline).toBeHidden();
    await expect.poll(() => hitTestPositions(legacy)).toEqual([expect.objectContaining({ visible: true })]);
    await legacy.click();
    await expect.poll(() => frame.evaluate(() => document.scrollingElement.scrollTop)).toBe(0);
    expect(await visitState()).toEqual(before);
  });
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
  const office = start.locator('.vgs-office');
  const grid = start.locator('.vgs-office-grid');
  await expect(office.getByRole('heading', { level: 1 })).toHaveText('Gabinet');
  await expect(grid.locator('h2')).toHaveText(['Pacjenci', 'Dzisiejsze wizyty', 'Przypomnienia', 'Plany opieki']);
  await expect(frame.locator('#gbEntryHeader .gb-breadcrumb').getByRole('button')).toHaveAccessibleName('Ekran startowy');
  await expect(frame.locator('#gbEntryHeader [aria-current="page"]')).toBeHidden();
  await expect(frame.locator('#gbEntryHeader [data-entry-separator]')).toBeHidden();
  await expect(office.locator('.vgs-heading .vgs-date time')).toHaveCount(1);
  await expect(office.locator('.vgs-date-long:visible, .vgs-date-short:visible')).toHaveCount(1);
  await expect(grid.locator('.vgs-schedule .vgs-appointment')).toHaveCount(1);
  await expect(grid.locator('.vgs-schedule')).toContainText('09:00');
  await expect(grid.locator('.vgs-count:visible')).toHaveCount(0);
  await expect(office.getByRole('button', { name: 'Wszystkie przypomnienia', exact: true })).toHaveCount(0);
  const allPlans = office.getByRole('button', { name: 'Pokaż wszystkie plany opieki', exact: true });
  await expect(allPlans).toBeVisible();
  expect(await allPlans.evaluate(node => node.getBoundingClientRect().top >=
    node.parentElement.querySelector('.vgs-related-body').getBoundingClientRect().bottom - 1)).toBe(true);
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
  const results = start.locator('#vgs-results');
  const list = office.getByRole('button', { name: 'Lista pacjentów', exact: true });
  for (const width of [1440, 390, 320]) {
    await page.setViewportSize({ width, height: 844 });
    // The shell updates the embedded document's host mode asynchronously.
    if (width >= 992) await expect(frame.locator('html')).toHaveClass(/vilda-form-host-desktop/);
    else await expect(frame.locator('html')).not.toHaveClass(/vilda-form-host-desktop/);
    await frame.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
    await expect.poll(() => list.evaluate(node => {
      const button = node.getBoundingClientRect(), field = node.parentElement.querySelector('.vgs-search-field').getBoundingClientRect();
      return [Math.round(button.top - field.top), Math.round(button.height - field.height), Math.round(button.left - field.right)];
    })).toEqual([0, 0, 0]);
    expect(await search.evaluate(node => {
      const input = node.getBoundingClientRect(), field = node.closest('.vgs-search-field').getBoundingClientRect();
      return input.width > 100 && input.left >= field.left && input.right <= field.right &&
        document.documentElement.scrollWidth <= innerWidth;
    })).toBe(true);
    const beforeSearch = await cards();
    await list.click();
    await expect(results).toBeVisible();
    expect(await cards()).toEqual(beforeSearch);
    await list.click();
    await expect(results).toBeHidden();
    await list.press('Enter');
    await expect(results).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(results).toBeHidden();
    await expect(search).toBeFocused();
    await search.fill('Antoni');
    await expect(results.locator('.vgs-found-row')).toHaveCount(1);
    await search.press('ArrowDown');
    await expect(results.getByRole('button', { name: 'Fikcyjny Antoni', exact: true })).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(results).toBeHidden();
    await expect(search).toBeFocused();
    expect(await cards()).toEqual(beforeSearch);
    await search.fill('');
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  const bell = page.locator('#vildaRemindersBtn');
  await bell.click();
  const remindersDialog = page.getByRole('dialog', { name: 'Przypomnienia', exact: true });
  await expect(remindersDialog).toBeVisible();
  await remindersDialog.getByRole('button', { name: /Zamknij/ }).first().click();
  await expect(remindersDialog).toBeHidden();
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

  await frame.evaluate(async ids => {
    const today = new Date().toLocaleDateString('sv-SE');
    for (let index = 0; index < 6; index++) await window.VildaVault.savePatientNote({
      patientId: ids.a, category: 'followup', title: 'Fikcyjna wizyta listy ' + index,
      dueDateISO: today, dueTime: String(10 + index) + ':00',
    });
    for (let index = 0; index < 2; index++) {
      await window.VildaVault.savePatientNote({
        patientId: ids.a, category: 'reminder-contact', title: 'Fikcyjne dodatkowe przypomnienie ' + index,
        dueDateISO: today, dueTime: '16:0' + index,
      });
      const saved = await window.VildaVault.mutateCarePlan({
        patientId: ids.b, action: 'create', operationId: crypto.randomUUID(),
        title: 'Fikcyjny dodatkowy plan ' + index, goal: 'Fikcyjny cel',
      });
      if (!saved.saved) throw new Error('Nie zapisano dodatkowego fikcyjnego planu.');
    }
  }, ids);
  const schedule = grid.locator('.vgs-schedule-body');
  await expect(schedule.locator('.vgs-appointment')).toHaveCount(7);
  for (const section of ['reminders', 'care']) {
    await expect(grid.locator('.vgs-' + section + ' .vgs-related-row')).toHaveCount(2);
    await expect(grid.locator('.vgs-' + section + ' .vgs-count')).toHaveText('3');
  }
  await expect(grid.locator('.vgs-schedule .vgs-count')).toHaveText('7');
  expect(await schedule.evaluate(node => node.scrollHeight <= node.clientHeight + 1)).toBe(true);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await expect(schedule).toHaveAttribute('data-scrollable', '');
  await expect(schedule).toHaveCSS('overflow-y', 'auto');
  expect(await schedule.evaluate(node => node.scrollHeight > node.clientHeight)).toBe(true);

  const archived = await frame.evaluate(id => window.VildaVault.getPatient(id).then(record => record.snapshots), ids.a);
  await search.fill('Antoni');
  await results.getByRole('button', { name: 'Nowa wizyta', exact: true }).click();
  await expect(frame.locator('#vhomeGabinetHeader')).toContainText('Antoni');
  await expect.poll(() => frame.evaluate(id => window.VildaHomeEncounter.state(id).mode, ids.a)).toBe('new');
  await expect(frame.locator('#height')).toHaveValue('');
  await expect(frame.locator('#weight')).toHaveValue('');
  expect(await frame.evaluate(() => sessionStorage.getItem('vildaCurrentPatientId'))).toBe(ids.a);
  expect(await frame.evaluate(id => window.VildaVault.getPatient(id).then(record => record.snapshots), ids.a)).toEqual(archived);
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
  await header.getByRole('button', { name: 'Nowa wizyta', exact: true }).click();
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
  await header.getByRole('button', { name: 'Nowa wizyta', exact: true }).click();
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
  await expect(dialog).toBeVisible({ timeout: 15_000 });
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
  await expect(frame.locator('#vhomeGabinetHeader').getByRole('button', { name: 'Nowa wizyta', exact: true })).toBeVisible();
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

test('Edytuj pacjenta saves identity and guardian independently and preserves the exact historical visits after F5', async ({ page }) => {
  let { frame, ids } = await prepare(page);
  const historical = await frame.evaluate(async patientId => {
    const vault = window.VildaVault;
    const template = (await vault.getPatient(patientId)).snapshots[0].payload;
    let older;
    for (const [date, height, weight, guardian] of [
      ['2025-06-17', 145, 35, 'Fikcyjny opiekun historyczny'],
      ['2026-06-17', 158, 46, 'Fikcyjny opiekun zapisanej wizyty'],
    ]) {
      const payload = structuredClone(template);
      payload.visit = window.VildaVisitContext.create({ patientId, clinicalDateISO: date });
      payload.user = { ...payload.user, measuredAtISO: date, age: date.startsWith('2025') ? 12 : 13,
        ageMonths: 0, height, weight };
      payload.guardian = { name: guardian, relation: 'inny', phone: '', email: '' };
      const receipt = await vault.savePatient(payload, { patientId, dedup: false });
      if (!older) older = { visitId: payload.visit.visitId, snapshotId: receipt.snapshotId, guardian };
    }
    return older;
  }, ids.a);
  await choosePatient(frame, 'Antoni');
  const records = () => frame.evaluate(async id => {
    const patient = await window.VildaVault.getPatient(id);
    return { snapshots: patient.snapshots, count: patient.snapshotCount, latest: patient.latest,
      visits: await window.VildaVault.getPatientVisits(id) };
  }, ids.a);
  const before = await records();
  const clinicalBefore = await frame.evaluate(() => {
    const value = window.VildaDataImportExport.captureCurrentUserDataReadOnly();
    delete value.timestampISO;
    return value;
  });
  const card = frame.locator('#vhomePatientOverview');
  await card.locator('.vhome-b1-menu-toggle').click();
  await card.getByRole('menuitem', { name: 'Edytuj pacjenta', exact: true }).click();
  const editor = frame.locator('.vilda-edit2');
  await expect(editor).toBeVisible();
  const guardian = 'Fikcyjna opiekunka aktualnej kartoteki';
  const firstName = 'Kartotekowy', dobISO = '2014-06-17';
  await editor.getByPlaceholder('Imię i nazwisko opiekuna', { exact: true }).fill(guardian);
  await editor.getByPlaceholder('Imię', { exact: true }).fill(firstName);
  await editor.getByPlaceholder('DD-MM-RRRR (opcjonalnie)', { exact: true }).fill('17-06-2014');
  await editor.getByRole('button', { name: 'Zapisz zmiany', exact: true }).click();
  await expect(editor).toBeHidden();
  await expect.poll(() => frame.evaluate(async id =>
    (await window.VildaVault.getPatient(id)).profile?.data?.guardian?.name, ids.a)).toBe(guardian);
  await expect(page.locator('#vildaPatientValue')).toContainText(firstName);
  await expect(frame.locator('#vhomeGabinetHeader h1')).toContainText(firstName);
  await expect(frame.locator('#vhomePatientOverview .vhome-b1-identity')).toContainText(firstName);
  await expect(page.locator('[data-menu-patient-name]').filter({ visible: true })).toContainText(firstName);
  expect(await frame.evaluate(async id =>
    (await window.VildaVault.getPatient(id)).profile.data.user, ids.a)).toMatchObject({ firstName, dobISO });
  expect(await records()).toEqual(before);
  expect(await frame.evaluate(() => {
    const value = window.VildaDataImportExport.captureCurrentUserDataReadOnly();
    delete value.timestampISO;
    return value;
  })).toEqual(clinicalBefore);

  await page.reload({ waitUntil: 'load' });
  frame = await shellFrame(page);
  await readyForPatient(frame);
  const header = frame.locator('#vhomeGabinetHeader');
  if (!await header.isVisible()) await choosePatient(frame, firstName);
  await expect(page.locator('#vildaPatientValue')).toContainText(firstName);
  expect(await frame.evaluate(async id =>
    (await window.VildaVault.getPatient(id)).profile.data.guardian.name, ids.a)).toBe(guardian);
  expect(await frame.evaluate(async id =>
    (await window.VildaVault.getPatient(id)).profile.data.user, ids.a)).toMatchObject({ firstName, dobISO });
  expect(await records()).toEqual(before);

  await header.getByRole('button', { name: 'Nowa wizyta', exact: true }).click();
  await expect.poll(() => frame.evaluate(id => window.VildaHomeEncounter.state(id).mode, ids.a)).toBe('new');
  expect(await frame.evaluate(() =>
    window.lastLoadedData.guardian.name)).toBe(guardian);
  expect(await frame.evaluate(() =>
    window.VildaDataImportExport.captureCurrentUserDataReadOnly().user)).toMatchObject({ firstName, dobISO, sex: 'M' });
  expect(await frame.evaluate(() =>
    window.VildaDataImportExport.captureCurrentUserDataReadOnly().advanced.data.measurements
      .filter(point => point.height === 158 && point.weight === 46)
      .map(point => ({ ageMonths: point.ageMonths, height: point.height, weight: point.weight }))
  )).toEqual([{ ageMonths: 156, height: 158, weight: 46 }]);
  await expect(frame.locator('#height')).toHaveValue('');
  await expect(frame.locator('#weight')).toHaveValue('');
  expect(await records()).toEqual(before);

  await openHistoryFromHeader(header);
  const history = frame.locator('#vhomeVisitHistory');
  await history.getByRole('button', { name: 'Lista', exact: true }).click();
  await history.locator(`.vhs-list button[data-visit-id="${historical.visitId}"]`).click();
  const detail = frame.locator('#vhomeVisitDetail');
  await expect(detail).toBeVisible();
  await expect(detail.locator('.vhome-dialog-heading').getByText(/12 lat 0 mies\./u)).toBeVisible();
  await expect(detail.locator('dl').filter({ has: frame.locator('dt', { hasText: /^Płeć$/ }) })).toContainText('Chłopiec / mężczyzna');
  const original = before.visits.find(row => row.visitId === historical.visitId).payload.user;
  expect(original).toMatchObject({ firstName: 'Antoni', age: 12, ageMonths: 0, dobISO: '2013-06-17', sex: 'M' });
  expect(await records()).toEqual(before);
  await detail.getByRole('button', { name: 'Edytuj wizytę', exact: true }).click();
  await expect.poll(() => frame.evaluate(id => window.VildaHomeEncounter.state(id).mode, ids.a)).toBe('edit');
  await header.getByRole('tab', { name: 'Analiza', exact: true }).click();
  await expect(frame.locator('#height')).toHaveValue('145');
  await expect(frame.locator('#weight')).toHaveValue('35');
  expect(await frame.evaluate(() =>
    window.lastLoadedData.guardian.name)).toBe(historical.guardian);
  expect(await frame.evaluate(() =>
    window.VildaDataImportExport.captureCurrentUserDataReadOnly().user)).toMatchObject({
    firstName: original.firstName, age: original.age, ageMonths: original.ageMonths,
    dobISO: original.dobISO, sex: original.sex,
  });
  expect(await frame.evaluate(id => window.VildaHomeEncounter.state(id).snapshotId, ids.a)).toBe(historical.snapshotId);
  expect(await records()).toEqual(before);
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
    return { latestId: latest.visitId, latestSnapshot: latest.snapshotId, latestRevision: latest.rev,
      targetId: earlierToday.visitId, targetSnapshot: earlierToday.snapshotId, revision: earlierToday.rev };
  }, ids.a);
  await choosePatient(frame, 'Antoni');
  const header = frame.locator('#vhomeGabinetHeader');
  const patientCard = frame.locator('#vhomePatientOverview > .vilda-auth-card');
  const notesTab = patientCard.getByRole('tab', { name: 'Notatki', exact: true });
  const addNote = patientCard.getByRole('button', { name: /Dodaj notatkę/ });
  await notesTab.click();
  await expect(addNote).toBeVisible();
  const trigger = header.getByRole('button', { name: 'Opcje', exact: true });
  await openHistoryFromHeader(header);
  const history = frame.locator('#vhomeVisitHistory');
  const title = history.getByRole('heading', { name: 'Wizyty pacjenta' });
  await expect(title).toBeVisible();
  await expect(patientCard).toBeHidden();
  await history.getByRole('button', { name: 'Wróć do przeglądu' }).click();
  await expect(notesTab).toHaveAttribute('aria-selected', 'true');
  await expect(addNote).toBeVisible();
  await expect(trigger).toBeFocused();
  await openHistoryFromHeader(header);
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
  await expect(header.getByRole('button', { name: 'Nowa wizyta', exact: true })).toBeVisible({ timeout: 30_000 });
  const saved = await frame.evaluate(async ({ pid, snapshotId }) => {
    const patient = await window.VildaVault.getPatient(pid);
    const edited = patient.snapshots.find(item => item.snapshotId === snapshotId);
    return [patient.snapshots[0].snapshotId, edited.rev, edited.payload.user.weight];
  }, { pid: ids.a, snapshotId: seed.targetSnapshot });
  expect(saved).toEqual([seed.latestSnapshot, seed.revision + 1, 44]);
  await expect(frame.locator('#weight')).toHaveValue('55');

  await trigger.click();
  await header.getByRole('button', { name: 'Edytuj wizytę z 21.11.2026', exact: true }).click();
  await expect(header.getByRole('tab', { name: 'Analiza', exact: true })).toHaveAttribute('aria-selected', 'true');
  await expect(frame.locator('#weight')).toBeEditable();
  await expect(frame.locator('#weight')).toHaveValue('55');
  const directEdit = await frame.evaluate(id => window.VildaHomeEncounter.state(id), ids.a);
  expect(directEdit).toMatchObject({mode:'edit', visitId:seed.latestId, snapshotId:seed.latestSnapshot, revision:seed.latestRevision});
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
  const date = header.locator('.gb-visit-context time');
  const options = header.getByRole('button', { name: 'Opcje', exact: true });
  const visitIds = () => frame.evaluate(async patientId =>
    (await window.VildaVault.getPatientVisits(patientId)).map(row => row.visitId), seed.patientId);
  await expect(date).toHaveText('15.11.2025');
  await expect(date).toHaveAttribute('datetime', '2025-11-15');
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

  await openHistoryFromHeader(header);
  const history = frame.locator('#vhomeVisitHistory');
  const openSaved = history.getByRole('button', { name: 'Otwórz podgląd wizyty', exact: true });
  await openSaved.click();
  const sheet = frame.locator('#vhomeVisitDetail');
  const novemberHeading = sheet.getByRole('heading', { name: 'Wizyta z 15.11.2025', exact: true });
  await expect(novemberHeading).toBeVisible();
  await sheet.getByRole('button', { name: 'Zamknij podgląd wizyty', exact: true }).click();
  await expect(openSaved).toBeFocused();
  await history.getByRole('button', { name: 'Wróć do analizy', exact: true }).click();
  await expect(analysis).toHaveAttribute('aria-selected', 'true');
  await expect(options).toBeFocused();
  await openHistoryFromHeader(header);
  await openSaved.click();
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

test('browsing visit history from Analysis on a phone preserves the open visit and its unsaved measurements', { tag: '@gabinet-webkit' }, async ({ page }) => {
  const { frame, ids } = await prepare(page);
  const notes = { archived: 'Notatka z fikcyjnej wizyty', general: 'Notatka ogólna Antoniego', other: 'Notatka ogólna Beaty' };
  const treatment = { diagnosis: 'Fikcyjne rozpoznanie aktualne', active: 'Fikcyjne leczenie aktualne',
    closed: 'Fikcyjne leczenie zakończone', foreign: 'Fikcyjne leczenie Beaty', drug: 'Fikcyjny preparat', dose: '0,030 mg/kg/d' };
  await frame.evaluate(async ({ ids, notes, treatment }) => {
    const vault = window.VildaVault;
    const [archived] = await vault.getPatientVisits(ids.a);
    await vault.savePatientNote({ patientId: ids.a, category: 'observation', title: notes.archived,
      visitContext: { version: 1, visitId: archived.visitId, clinicalDateISO: archived.clinicalDateISO } });
    await vault.savePatientNote({ patientId: ids.a, category: 'observation', title: notes.general });
    await vault.savePatientNote({ patientId: ids.b, category: 'observation', title: notes.other });
    const scope = window.VildaPatientTreatmentStore.createScope({vault, patientId:ids.a, isCurrent:()=>true});
    const diagnosis = await scope.createDiagnosis({name:treatment.diagnosis, code:'I10', status:'active', dateISO:'2026-11-20'});
    await scope.createEpisode({title:treatment.active, method:'pharmacological', status:'active',
      medication:treatment.drug, dose:treatment.dose, diagnosisIds:[diagnosis.id], startDateISO:'2026-11-20'});
    await scope.createEpisode({title:treatment.closed, method:'other', status:'closed', endDateISO:'2026-10-31'});
    scope.dispose();
    const foreign = window.VildaPatientTreatmentStore.createScope({vault, patientId:ids.b, isCurrent:()=>true});
    await foreign.createEpisode({title:treatment.foreign, method:'other', status:'active'});foreign.dispose();
  }, { ids, notes, treatment });
  await page.setViewportSize({ width: 320, height: 844 });
  await choosePatient(frame, 'Antoni');
  const header = frame.locator('#vhomeGabinetHeader');
  const context = header.locator('.gb-visit-context');
  const options = header.getByRole('button', { name: 'Opcje', exact: true });
  const newVisit = header.getByRole('button', { name: 'Nowa wizyta', exact: true });
  await expect(context.locator('.gb-visit-source time')).toHaveText('17.06.2026');
  await expect(context.locator('.gb-visit-source time')).toHaveAttribute('datetime', '2026-06-17');
  await expect(context.locator('[data-state-label]')).toBeHidden();
  const readOnly = context.locator('.gb-readonly-badge');
  await expect(readOnly).toHaveText('Dane wizyty · tylko odczyt');
  await expect(readOnly).toBeVisible();
  const narrowBadge = await readOnly.evaluate(node => {
    const bounds = node.getBoundingClientRect();
    return { left: bounds.left, right: bounds.right, viewport: innerWidth,
      content: node.scrollWidth, width: node.clientWidth };
  });
  expect(narrowBadge.left).toBeGreaterThanOrEqual(0);
  expect(narrowBadge.right).toBeLessThanOrEqual(narrowBadge.viewport + 1);
  expect(narrowBadge.content).toBeLessThanOrEqual(narrowBadge.width + 1);
  expect(await frame.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
  await page.setViewportSize({ width: 390, height: 844 });
  const [optionsBox, newVisitBox] = await Promise.all([options.boundingBox(), newVisit.boundingBox()]);
  expect(optionsBox.width).toBeCloseTo(newVisitBox.width, 0);
  expect(optionsBox.height).toBeCloseTo(newVisitBox.height, 0);
  await options.click();
  await expect(header.getByRole('button', { name: 'Edytuj wizytę z 17.06.2026', exact: true })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(options).toHaveAttribute('aria-expanded', 'false');
  await expect(options).toBeFocused();
  await newVisit.click();
  await expect(header.getByRole('button', { name: 'Zapisz wizytę' })).toBeVisible();
  await expect(readOnly).toBeHidden();
  await expect(context.locator('[data-state-label]')).toHaveText('Nowa wizyta');
  const analysis = header.getByRole('tab', { name: 'Analiza', exact: true });
  await analysis.click();
  await frame.locator('#height').fill('159');
  await frame.locator('#weight').fill('49');
  const patientState = () => frame.evaluate(async patientId => ({
    encounter: window.VildaHomeEncounter.state(patientId),
    snapshots: (await window.VildaVault.getPatient(patientId)).snapshots.map(row => [row.snapshotId, row.rev]),
    documents: await window.VildaVault.listPatientNotesForPatient(patientId),
  }), ids.a);
  const before = await patientState();
  expect(before.encounter.mode).toBe('new');
  const trigger = header.getByRole('button', { name: 'Opcje', exact: true });
  await openHistoryFromHeader(header);
  const history = frame.locator('#vhomeVisitHistory');
  await expect(history.getByRole('tab')).toHaveCount(1);
  await expect(history.locator('.vhs-paper[data-active]')).toHaveCSS('transition-duration', '0s');
  await history.getByRole('button', { name: 'Otwórz podgląd wizyty' }).click();
  const detail = frame.locator('dialog.vhome-history-detail');
  const access = detail.locator('.vd-access');
  const startFromDetail = access.getByRole('button', { name: 'Rozpocznij nową wizytę', exact: true });
  await expect(access).toContainText('Tylko odczyt');
  await expect(access).toHaveCSS('background-color', 'rgb(255, 248, 236)');
  await expect(access.getByRole('button')).toHaveCount(2);
  await expect(access.getByRole('button', { name: 'Edytuj wizytę', exact: true })).toBeVisible();
  await expect(startFromDetail).toBeVisible();
  const accessGeometry = () => access.evaluate(node => [node, ...node.querySelectorAll('button')].map(item => {
    const { x, y, width, height } = item.getBoundingClientRect();
    return { x, y, width, height };
  }));
  const accessBefore = await accessGeometry();
  expect(accessBefore[1].width).toBeCloseTo(accessBefore[2].width, 0);
  expect(accessBefore[1].height).toBeCloseTo(accessBefore[2].height, 0);
  expect(accessBefore[1].y).toBeCloseTo(accessBefore[2].y, 0);
  async function expectAccessStable() {
    await expect.poll(accessGeometry).toEqual(accessBefore);
    const bounds = await detail.evaluate(node => ({ content: node.scrollWidth, width: node.clientWidth,
      left: node.getBoundingClientRect().left, right: node.getBoundingClientRect().right, viewport: innerWidth }));
    expect(bounds.content).toBeLessThanOrEqual(bounds.width + 1);
    expect(bounds.left).toBeGreaterThanOrEqual(-0.5);
    expect(bounds.right).toBeLessThanOrEqual(bounds.viewport + 0.5);
  }
  const detailBody = detail.locator('.vhome-dialog-body');
  await detailBody.evaluate(node => node.scrollTo({ top: node.scrollHeight, behavior: 'instant' }));
  await expect.poll(() => detailBody.evaluate(node => node.scrollTop)).toBeGreaterThan(0);
  await expectAccessStable();
  await startFromDetail.click();
  const loadGuard = frame.locator('dialog.vug-backdrop');
  await expect(loadGuard).toBeVisible();
  await loadGuard.getByRole('button', { name: 'Anuluj', exact: true }).click();
  await expect(loadGuard).toBeHidden();
  await expect(detail).toBeVisible();
  await expect(startFromDetail).toBeFocused();
  expect(await patientState()).toEqual(before);
  await expect(frame.locator('#height')).toHaveValue('159');
  await expect(frame.locator('#weight')).toHaveValue('49');
  await expectAccessStable();
  await expect(detail.getByRole('tabpanel', { name: 'Wyniki', exact: true })).toContainText('46 kg');
  await expect(detail).toContainText(notes.archived);
  await expect(detail).not.toContainText(notes.general);
  await expect(detail).not.toContainText(treatment.active);
  await detail.getByRole('tab', { name: 'Siatka centylowa' }).click();
  await expect(detail.getByRole('tabpanel', { name: 'Siatka centylowa' }).locator('svg')).toBeVisible();
  await expectAccessStable();
  await detail.getByRole('tab', { name: 'Porównanie' }).click();
  const comparison = detail.getByRole('row', { name: /Masa ciała/ });
  await expect(comparison.getByRole('cell').first()).toHaveText('46 kg');
  await expect(comparison.getByRole('cell').last()).toContainText('49 kg');
  await expectAccessStable();
  await detail.getByRole('tab', { name: 'Informacje ogólne' }).click();
  const general = detail.getByRole('tabpanel', { name: 'Informacje ogólne' });
  await expect(general).toContainText(notes.general);
  await expect(general).not.toContainText(notes.archived);
  await expect(general).not.toContainText(notes.other);
  await expect(general).toContainText('I10 — ' + treatment.diagnosis);
  await expect(general).toContainText(treatment.active);
  await expect(general).toContainText(treatment.drug);
  await expect(general).toContainText(treatment.dose);
  await expect(general).not.toContainText(treatment.closed);
  await expect(general).not.toContainText(treatment.foreign);
  await expect(general.getByRole('button', {name:'Leczenie pacjenta', exact:true})).toBeVisible();
  await expectAccessStable();
  await detail.getByRole('button', { name: 'Zamknij podgląd wizyty' }).click();
  await history.getByRole('button', { name: /^Wróć/ }).click();
  await expect(history).toBeHidden();
  await expect(analysis).toHaveAttribute('aria-selected', 'true');
  await expect(trigger).toBeFocused();
  await expect(frame.locator('#height')).toHaveValue('159');
  await expect(frame.locator('#weight')).toHaveValue('49');
  expect(await patientState()).toEqual(before);

  await openHistoryFromHeader(header);
  await history.getByRole('button', { name: 'Otwórz podgląd wizyty' }).click();
  await detail.getByRole('tab', { name: 'Informacje ogólne' }).click();
  await detail.getByRole('button', {name:'Leczenie pacjenta', exact:true}).click();
  await expect(history).toBeHidden();
  const patientCard = frame.locator('#vhomePatientOverview');
  await expect(patientCard.getByRole('combobox', {name:'Sekcja karty', exact:true})).toHaveValue('treatment');
  await expect(patientCard).toContainText(treatment.active);
  await analysis.click();
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

  await choosePatient(frame, 'Antoni');
  const savedVisits = () => frame.evaluate(async id => ({
    snapshots: (await window.VildaVault.getPatient(id)).snapshots,
    visits: await window.VildaVault.getPatientVisits(id),
  }), ids.a);
  const archived = await savedVisits();
  await openHistoryFromHeader(header);
  await history.getByRole('button', { name: 'Otwórz podgląd wizyty' }).click();
  await expect(startFromDetail).toBeVisible();
  await startFromDetail.click();
  await expect(detail).toBeHidden();
  await expect(history).toBeHidden();
  await expect.poll(() => frame.evaluate(id => window.VildaHomeEncounter.state(id).mode, ids.a)).toBe('new');
  const current = await frame.evaluate(id => ({
    patientId: sessionStorage.getItem('vildaCurrentPatientId'),
    visitId: window.VildaHomeEncounter.state(id).visitId,
  }), ids.a);
  expect(current.patientId).toBe(ids.a);
  expect(current.visitId).toBeTruthy();
  expect(current.visitId).not.toBe(before.encounter.visitId);
  expect(archived.visits.some(row => row.visitId === current.visitId)).toBe(false);
  await analysis.click();
  await expect(frame.locator('#height')).toHaveValue('');
  await expect(frame.locator('#weight')).toHaveValue('');
  await expect(frame.locator('#height')).toBeEditable();
  await expect(frame.locator('#weight')).toBeEditable();
  expect(await savedVisits()).toEqual(archived);
  await header.getByRole('button', { name: 'Zapisz wizytę', exact: true }).click();
  await expect.poll(() => frame.evaluate(id => window.VildaHomeEncounter.state(id).mode, ids.a)).toBe('browse');
  const saved = await savedVisits();
  expect(saved.snapshots).toHaveLength(archived.snapshots.length + 1);
  expect(saved.snapshots.filter(row => row.payload?.visit?.visitId !== current.visitId)).toEqual(archived.snapshots);
  expect(saved.visits.filter(row => row.visitId !== current.visitId)).toEqual(archived.visits);
  const fresh = saved.visits.filter(row => row.visitId === current.visitId);
  expect(fresh).toHaveLength(1);
  expect(fresh[0].payload.user.height).toBeNull();
  expect(fresh[0].payload.user.weight).toBeNull();
  expect(fresh[0].payload.user.measuredAtISO ?? null).toBeNull();
});

test('a new note in Overview keeps the active encounter and an independent clinical date', async ({ page }) => {
  const { frame, ids } = await prepare(page);
  await choosePatient(frame,'Antoni');
  const header = frame.locator('#vhomeGabinetHeader');
  await header.getByRole('button',{name:'Nowa wizyta',exact:true}).click();
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

test('a visit diagnosis shows its destination and can be removed only from its own open visit', async ({ page }) => {
  const { frame, ids } = await prepare(page);
  await choosePatient(frame, 'Antoni');
  const header = frame.locator('#vhomeGabinetHeader');
  const card = frame.locator('#vhomePatientOverview');
  const editor = frame.locator('#vhomePatientTreatmentDialog');
  const treatment = card.getByRole('tab', { name: 'Leczenie', exact: true });
  const name = 'Fikcyjne rozpoznanie powiązane z wizytą';
  const diagnosis = () => frame.evaluate(async ({ patientId, name }) =>
    (await window.VildaVault.listPatientNotesForPatient(patientId))
      .find(note => note.treatmentContext?.kind === 'diagnosis' && note.treatmentContext.name === name) || null,
  { patientId: ids.a, name });

  await header.getByRole('button', { name: 'Nowa wizyta', exact: true }).click();
  await treatment.click();
  const visit = await frame.evaluate(id => window.VildaHomeEncounter.state(id), ids.a);
  const date = visit.date.split('-').reverse().join('.');
  await card.getByRole('button', { name: 'Dodaj rozpoznanie', exact: true }).click();
  await expect(editor.getByText('Zapis z powiązaniem do wizyty z ' + date, { exact: true })).toBeVisible();
  await editor.getByLabel('Nazwa rozpoznania').fill(name);
  await editor.getByRole('button', { name: 'Zapisz', exact: true }).click();
  await expect(editor).toBeHidden();
  await expect.poll(diagnosis).toMatchObject({ visitContext: { visitId: visit.visitId, clinicalDateISO: visit.date } });
  const note = await diagnosis();
  await header.getByRole('button', { name: 'Zapisz wizytę', exact: true }).click();
  await expect(header.getByText('Dane wizyty · tylko odczyt', { exact: true })).toBeVisible();
  const visits = () => frame.evaluate(id => window.VildaVault.getPatientVisits(id), ids.a);
  const beforeRemoval = await visits();
  const edit = card.locator(`[data-treatment-diagnosis-id="${note.id}"]`).getByRole('button', { name: 'Edytuj', exact: true });
  await treatment.click();
  await edit.click();
  await expect(editor.getByText('Powiązanie z wizytą z ' + date, { exact: true })).toBeVisible();
  await expect(editor.getByLabel('Nazwa rozpoznania')).not.toBeEditable();
  await expect(editor.getByRole('button', { name: 'Usuń rozpoznanie', exact: true })).toBeDisabled();
  await editor.getByRole('button', { name: 'Anuluj', exact: true }).click();
  expect(await diagnosis()).toEqual(note);

  await header.getByRole('button', { name: 'Opcje', exact: true }).click();
  await header.getByRole('button', { name: 'Edytuj wizytę z ' + date, exact: true }).click();
  await expect(header.getByRole('button', { name: 'Zapisz zmiany', exact: true })).toBeVisible();
  await header.getByRole('tab', { name: 'Przegląd', exact: true }).click();
  await treatment.click();
  await edit.click();
  await expect(editor.getByText('Zapis z powiązaniem do wizyty z ' + date, { exact: true })).toBeVisible();
  const remove = editor.getByRole('button', { name: 'Usuń rozpoznanie', exact: true });
  await expect(remove).toBeEnabled();
  page.once('dialog', confirmation => confirmation.accept());
  await remove.click();
  await expect(editor).toBeHidden();
  await expect.poll(diagnosis).toBeNull();
  expect(await visits()).toEqual(beforeRemoval);
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
  await header.getByRole('button', { name: 'Nowa wizyta' }).click();
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
  await expect(header.locator('.gb-visit-context time')).toHaveText('16.10.2026');
  await openHistoryFromHeader(header);
  await frame.locator('#vhomeVisitHistory').getByRole('button', { name: 'Otwórz podgląd wizyty', exact: true }).click();
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
  await header.getByRole('button', { name: 'Nowa wizyta' }).click();
  await header.getByRole('button', { name: 'Zapisz wizytę' }).click();
  await expect(header.getByRole('button', { name: 'Nowa wizyta' })).toBeVisible();
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
  await expect(header.locator('.gb-visit-context time')).toHaveAttribute('datetime', persisted.date);
  await expect(header.locator('.gb-visit-context [data-state-label]')).toBeHidden();
  await expect(header.locator('.gb-readonly-badge')).toHaveText('Dane wizyty · tylko odczyt');
  await expect(header.locator('.gb-readonly-badge')).toBeVisible();
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

  await header.getByRole('button', { name: 'Nowa wizyta', exact: true }).click();
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

test('a mobile reminder added to an existing plan retains the active visit and its separate future due date', async ({ page }) => {
  await page.setViewportSize({width:390, height:844});
  const {frame, ids} = await prepare(page);
  await choosePatient(frame, 'Antoni');
  const plan = await frame.evaluate(patientId => window.VildaVault.mutateCarePlan({
    patientId, operationId:crypto.randomUUID(), action:'create',
    title:'Fikcyjny plan kontroli przypomnienia', goal:'Fikcyjny scenariusz mobilny'
  }), ids.a);
  expect(plan.saved).toBe(true);
  const header = frame.locator('#vhomeGabinetHeader');
  await header.getByRole('button', {name:'Nowa wizyta', exact:true}).click();
  await expect.poll(() => frame.evaluate(id => window.VildaHomeEncounter.state(id).mode, ids.a)).toBe('new');
  const visit = await frame.evaluate(() => window.VildaDataImportExport.captureCurrentUserDataReadOnly().visit);
  const origin = {version:1, visitId:visit.visitId, clinicalDateISO:visit.clinicalDateISO};
  const reminderDay = new Date(visit.clinicalDateISO + 'T12:00:00Z');
  reminderDay.setUTCDate(reminderDay.getUTCDate() + 14);
  const dueDateISO = reminderDay.toISOString().slice(0, 10);
  await header.getByRole('tab', {name:'Przegląd', exact:true}).click();
  await frame.locator('#vhomePatientOverview select.vhome-b1-mobile-select').selectOption('reminders');
  await frame.locator('#vhomePatientRemindersSlot').getByRole('button', {name:'Dodaj przypomnienie', exact:true}).click();
  const dialog = page.locator('dialog.vhome-reminders-dialog');
  await dialog.getByLabel('Plan opieki (opcjonalnie)', {exact:true}).selectOption(plan.planId);
  const title = 'Fikcyjne przypomnienie planu z otwartej wizyty';
  await dialog.getByLabel('Treść przypomnienia', {exact:true}).fill(title);
  await dialog.getByLabel('Przypomnij w dniu', {exact:true}).fill(dueDateISO);
  await dialog.getByRole('button', {name:'Zapisz przypomnienie', exact:true}).click();
  const read = () => frame.evaluate(async ({patientId, title, planId, visitId}) => {
    const [notes, plan, visits] = await Promise.all([
      window.VildaVault.listPatientNotesForPatient(patientId), window.VildaVault.getCarePlan(planId),
      window.VildaVault.getPatientVisits(patientId)
    ]);
    return {note:notes.find(note => note.title === title), plan, visit:visits.find(row => row.visitId === visitId)};
  }, {patientId:ids.a, title, planId:plan.planId, visitId:visit.visitId});
  await expect.poll(async () => !!(await read()).note, {message:'Przypomnienie wybranego planu zostało zapisane'}).toBe(true);
  await expect.poll(async () => (await read()).note?.visitContext).toEqual(origin);
  const saved = await read();
  expect(saved.note).toMatchObject({patientId:ids.a, dueDateISO:dueDateISO + 'T00:00:00.000Z', careContext:{planId:plan.planId}, visitContext:origin});
  expect(saved.plan.patientId).toBe(ids.a);
  expect(saved.plan.steps.find(step => step.reminderNoteId === saved.note.id)).toMatchObject({reminderNoteId:saved.note.id, reminderDateISO:dueDateISO});
  expect(saved.plan.log.find(entry => entry.text?.includes(title))?.visitContext).toEqual(origin);
  expect(saved.plan.visitContext).toBeUndefined();
  expect(saved.visit).toMatchObject({patientId:ids.a, visitId:visit.visitId, clinicalDateISO:visit.clinicalDateISO});
  expect(dueDateISO).not.toBe(visit.clinicalDateISO);
});

test('saved Gabinet measurements keep Growth and clinical tools read-only until an explicit new or edit visit', async ({ page }) => {
  const { frame, ids } = await prepare(page);
  await choosePatient(frame, 'Antoni');
  const header = frame.locator('#vhomeGabinetHeader');
  const stored = () => frame.evaluate(async id => ({
    snapshots: (await window.VildaVault.getPatient(id)).snapshots,
    visits: await window.VildaVault.getPatientVisits(id),
  }), ids.a);
  const working = () => frame.evaluate(() => {
    const payload = window.VildaDataImportExport.captureCurrentUserDataReadOnly();
    const session = window.VildaPersistence.readMainSession();
    delete payload.timestampISO;
    if (session) delete session.timestampISO;
    return { payload, session };
  });
  const archived = await stored();
  await header.getByRole('tab', { name: 'Analiza', exact: true }).click();
  await expect(frame.locator('#height')).toHaveValue('158');
  await expect(frame.locator('#weight')).toHaveValue('46');
  await expect.poll(() => frame.evaluate(id => window.VildaHomeEncounter.state(id).mode, ids.a)).toBe('browse');
  const before = await working();
  async function growthData() {
    await frame.locator('#vhomeGrowthExpand').click();
    const dialog = frame.locator('#vhomeGrowthDialog');
    await expect(dialog).toBeVisible();
    await dialog.getByRole('tab', { name: 'Dane i pomiary', exact: true }).click();
    return dialog;
  }
  async function tool(id) {
    const toggle = frame.locator('#vhomeOtherToolsToggle');
    if (await toggle.getAttribute('aria-expanded') === 'false') await toggle.click();
    await frame.locator(`[data-home-tool="${id}"]`).click();
    const dialog = frame.locator('#vhomeToolDialog');
    await expect(dialog).toBeVisible();
    return { dialog, fields: dialog.frameLocator('iframe[data-home-tool-draft]') };
  }
  const readonlyGrowth = await growthData();
  await expect(readonlyGrowth.locator('[data-growth-field="advBoneAge"]')).toBeDisabled();
  await expect(readonlyGrowth.locator('[data-growth-field="advMotherHeight"]')).toBeDisabled();
  await expect(readonlyGrowth.locator('[data-growth-history-field]').first()).toBeVisible();
  await expect(readonlyGrowth.locator('[data-growth-history-field]:enabled')).toHaveCount(0);
  await expect(readonlyGrowth.getByRole('button', { name: '+ Dodaj pomiar', exact: true })).toBeDisabled();
  await expect(readonlyGrowth.locator('.vhome-growth-remove:enabled')).toHaveCount(0);
  await expect(readonlyGrowth.locator('.vhome-dialog-apply')).toBeHidden();
  await readonlyGrowth.locator('.vhome-dialog-cancel').click();
  for (const id of ['whr', 'respiration']) {
    const { dialog, fields } = await tool(id);
    const input = fields.locator('.vhome-tool-fields input, .vhome-tool-fields select');
    expect(await input.count()).toBeGreaterThan(0);
    for (const field of await input.all()) await expect(field).toBeDisabled();
    await expect(dialog.locator('.vhome-dialog-apply')).toBeHidden();
    await dialog.locator('.vhome-dialog-cancel').click();
  }
  expect(await working()).toEqual(before);
  expect(await stored()).toEqual(archived);

  let visitId;
  for (const [mode, boneAge, waist, hip] of [['new', '11.5', '70', '80'], ['edit', '12', '71', '81']]) {
    if (mode === 'new') {
      await header.getByRole('button', { name: 'Nowa wizyta', exact: true }).click();
    } else {
      await header.getByRole('button', { name: 'Opcje', exact: true }).click();
      await header.getByRole('button', { name: /^Edytuj wizytę z / }).click();
    }
    await expect.poll(() => frame.evaluate(id => window.VildaHomeEncounter.state(id).mode, ids.a)).toBe(mode);
    const activeId = await frame.evaluate(id => window.VildaHomeEncounter.state(id).visitId, ids.a);
    if (mode === 'new') visitId = activeId;
    else expect(activeId).toBe(visitId);
    await header.getByRole('tab', { name: 'Analiza', exact: true }).click();
    const growth = await growthData();
    const bone = growth.locator('[data-growth-field="advBoneAge"]');
    await expect(bone).toBeEditable();
    await expect(growth.locator('[data-growth-history-field]').first()).toBeEditable();
    await expect(growth.getByRole('button', { name: '+ Dodaj pomiar', exact: true })).toBeEnabled();
    await bone.fill(boneAge);
    await growth.locator('.vhome-dialog-apply').click();
    await expect(growth).toBeHidden();
    const { dialog, fields } = await tool('whr');
    const waistField = fields.getByRole('spinbutton', { name: 'Obwód talii · cm', exact: true });
    await expect(waistField).toBeEditable();
    await waistField.fill(waist);
    await fields.getByRole('spinbutton', { name: 'Obwód bioder · cm', exact: true }).fill(hip);
    await dialog.locator('.vhome-dialog-apply').click();
    await expect(dialog).toBeHidden();
    await expect.poll(() => frame.evaluate(() => {
      const session = window.VildaPersistence.readMainSession();
      return [session?.advanced?.boneAgeYears, session?.user?.waist, session?.user?.hip];
    })).toEqual([Number(boneAge), Number(waist), Number(hip)]);
    const beforeSave = await stored();
    expect(beforeSave.snapshots.filter(row => row.payload?.visit?.visitId !== visitId)).toEqual(archived.snapshots);
    expect(beforeSave.visits.filter(row => row.visitId !== visitId)).toEqual(archived.visits);
    await header.getByRole('button', { name: mode === 'new' ? 'Zapisz wizytę' : 'Zapisz zmiany', exact: true }).click();
    await expect(header.getByRole('button', { name: 'Nowa wizyta', exact: true })).toBeVisible({ timeout: 15_000 });
    await expect.poll(() => frame.evaluate(id => window.VildaHomeEncounter.state(id).mode, ids.a)).toBe('browse');
    const after = await stored();
    expect(after.snapshots).toHaveLength(archived.snapshots.length + 1);
    expect(after.snapshots.filter(row => row.payload?.visit?.visitId !== visitId)).toEqual(archived.snapshots);
    expect(after.visits.filter(row => row.visitId !== visitId)).toEqual(archived.visits);
    const saved = after.visits.find(row => row.visitId === visitId);
    expect(saved.payload.advanced.boneAgeYears).toBe(Number(boneAge));
    expect(saved.payload.user).toMatchObject({ waist: Number(waist), hip: Number(hip) });
  }
});
