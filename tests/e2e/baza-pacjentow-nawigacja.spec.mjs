import { expect, test } from '../support/test-czas.mjs';
import { createFictionalVault } from '../support/centile-live-fixture.mjs';
import { visibleChromeMenu, closeChromeMenu } from '../support/chrome-menu-fixture.mjs';
import { przygotujBaze, sortuj } from '../support/baza-pacjentow-lista.mjs';

test.use({ serviceWorkers: 'block' });
test.setTimeout(120_000);

async function openDatabase(page, frame) {
  const menu = await visibleChromeMenu(page);
  await menu.getByRole('button', { name: 'Baza pacjentów', exact: true }).click();
  await expect(frame.locator('.vilda-patient-database')).toBeVisible();
}

async function navigationIsAccessible(page, frame) {
  await expect(frame.locator('.pt-home')).toBeVisible();
  await expect(frame.locator('.vilda-auth-card')).toHaveAttribute('role', 'region');
  await expect(frame.locator('.vilda-auth-card')).not.toHaveAttribute('aria-modal', 'true');
  await expect(frame.locator('.vilda-auth-brand')).toBeHidden();
  if (frame === page) {
    await expect(page.locator('#mobileBottomDock')).toBeHidden();
    await expect(page.locator('#scrollTopBtn')).toBeHidden();
  }
  const header = await page.locator('header[data-vilda-chrome-mounted]').evaluate(node => {
    const rect = node.getBoundingClientRect();
    const target = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
    return { top: rect.top, bottom: rect.bottom, height: rect.height, covered: !node.contains(target) };
  });
  expect(header.height).toBeGreaterThan(0);
  expect(header.covered, 'Baza nie zasłania globalnego nagłówka').toBe(false);
  const back = await frame.locator('.pt-home').evaluate(node => {
    const rect = node.getBoundingClientRect();
    const target = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
    return { top: rect.top, covered: !node.contains(target) };
  });
  expect(back.covered, 'Wróć jest dostępne, także poniżej 700 px').toBe(false);
  if (frame === page) expect(back.top).toBeGreaterThanOrEqual(header.bottom);
  expect(await frame.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
}

for (const shell of [false, true]) {
  test(`${shell ? 'powłoka' : 'samodzielna strona'}: nagłówek i powrót w 390/699/700 px, także podczas odczytu`, async ({ page }) => {
    const { frame } = await createFictionalVault(page, { shell });
    for (const width of [390, 699, 700]) {
      await page.setViewportSize({ width, height: 844 });
      await openDatabase(page, frame);
      await expect(frame.locator('.pt-row')).toHaveCount(2);
      await navigationIsAccessible(page, frame);
      // The exposed header is functional: its drawer must appear above the list.
      await visibleChromeMenu(page);
      await expect(page.locator('[data-vilda-chrome-drawer]')).toBeVisible();
      await closeChromeMenu(page);
      await frame.locator('.pt-home').click();
      await expect(frame.locator('.vilda-patient-database')).toHaveCount(0);
      await expect(frame.locator('html')).not.toHaveClass(/vilda-patient-database-open/);
      if (shell) await expect.poll(() => page.evaluate(() => window.VildaShell.getCurrentRoute())).toBe('start');
      else await expect(page).toHaveURL(/\/index\.html(?:[?#]|$)/);
    }

    // Delay the actual storage API, not the UI. Back must work before the read
    // finishes, and resolving the abandoned read must never reopen the database.
    await frame.evaluate(() => {
      const vault = window.VildaVault;
      const key = typeof vault.listPatientDirectory === 'function' ? 'listPatientDirectory' : 'listPatients';
      const original = vault[key];
      let release;
      const gate = new Promise(resolve => { release = resolve; });
      vault[key] = async function (...args) { await gate; return original.apply(vault, args); };
      window.__databaseRead = { release, restore: () => { vault[key] = original; } };
      window.__databasePending = window.VildaAuthUI.showPatientsList(() => {});
    });
    await expect(frame.locator('.pt-loading')).toContainText('Wczytywanie');
    await navigationIsAccessible(page, frame);
    await frame.locator('.pt-home').click();
    await expect(frame.locator('.vilda-patient-database')).toHaveCount(0);
    await frame.evaluate(async () => {
      window.__databaseRead.release();
      await window.__databasePending;
      window.__databaseRead.restore();
    });
    await expect(frame.locator('.vilda-patient-database')).toHaveCount(0);
    await openDatabase(page, frame);
    await expect(frame.locator('.pt-row')).toHaveCount(2);
    await navigationIsAccessible(page, frame);
  });
}

test('samodzielny DocPro: Wróć otwiera Start, a logowanie zachowuje pełny ekran', async ({ page }) => {
  await createFictionalVault(page);
  await page.goto('/docpro.html', { waitUntil: 'load' });
  await page.waitForFunction(() => window.VildaAuthUI?.isBootReady() && window.VildaVault?.isUnlocked());
  const professional = page.locator('#professionalConfirmBtn');
  // DocPro mounts this gate asynchronously after auth restoration; checking
  // isVisible once can miss it and leave it covering the menu a moment later.
  await expect(professional).toBeVisible();
  await professional.click();
  await expect(page.locator('#professionalOverlay')).toBeHidden();
  await page.setViewportSize({ width: 390, height: 844 });
  await openDatabase(page, page);
  await expect(page.locator('.pt-row')).toHaveCount(2);
  await navigationIsAccessible(page, page);
  await page.locator('.pt-home').click();
  await expect(page).toHaveURL(/\/index\.html(?:[?#]|$)/);
  await page.waitForFunction(() => window.VildaAuthUI?.isBootReady() && window.VildaVault?.isUnlocked());
  await page.evaluate(() => window.VildaVault.lock());
  await expect(page.locator('.vilda-auth-root')).toBeVisible();
  await expect(page.locator('.vilda-auth-root')).not.toHaveClass(/vilda-auth-database/);
  expect((await page.locator('.vilda-auth-root').boundingBox()).y).toBe(0);
});

test('błąd odczytu pokazuje ponowienie zamiast fałszywej pustej bazy', async ({ page }) => {
  const { frame } = await createFictionalVault(page);
  await frame.evaluate(() => {
    const vault = window.VildaVault;
    const key = typeof vault.listPatientDirectory === 'function' ? 'listPatientDirectory' : 'listPatients';
    const original = vault[key];
    vault[key] = async () => { throw new Error('Fikcyjny błąd odczytu E2E'); };
    window.__restoreDatabaseRead = () => { vault[key] = original; };
  });
  await openDatabase(page, frame);
  await expect(frame.locator('.pt-loading[role="alert"]')).toContainText('Nie udało się wczytać');
  await navigationIsAccessible(page, frame);
  await frame.evaluate(() => window.__restoreDatabaseRead());
  await frame.getByRole('button', { name: 'Spróbuj ponownie', exact: true }).click();
  await expect(frame.locator('.pt-row')).toHaveCount(2);
});

test('Baza pokazuje pełną datę, aktualny wiek i płeć słownie bez zmiany wieku klinicznego', async ({ page }) => {
  const { frame } = await createFictionalVault(page);
  await page.clock.setFixedTime(new Date('2026-11-05T12:00:00+01:00'));
  const ids = await frame.evaluate(async () => {
    const vault = window.VildaVault;
    const full = await vault.savePatient({ name: 'Fikcyjna Metadane Anna', user: {
      lastName: 'Fikcyjna Metadane', firstName: 'Anna', dobISO: '2014-03-14', sex: 'F', age: 8, ageMonths: 5,
    } }, { dedup: false, forceNew: true });
    const savedAge = await vault.savePatient({ name: 'Fikcyjny Bezdaty Jan', user: {
      lastName: 'Fikcyjny Bezdaty', firstName: 'Jan', sex: 'M', age: 12, ageMonths: 7,
    } }, { dedup: false, forceNew: true });
    const year = await vault.saveExternalPatient({ lastName: 'Fikcyjna Rok', firstName: 'Ewa', sex: 'K', birthYear: 2016 });
    return { full: full.patientId, savedAge: savedAge.patientId, year: year.patientId };
  });
  await openDatabase(page, frame);
  const full = frame.locator(`[data-patient-id="${ids.full}"]`);
  const savedAge = frame.locator(`[data-patient-id="${ids.savedAge}"]`);
  const year = frame.locator(`[data-patient-id="${ids.year}"]`);
  for (const width of [1280, 390]) {
    await page.setViewportSize({ width, height: 844 });
    await expect(full.locator(width < 700 ? '.pt-mobile-birth' : '.pt-birth')).toHaveText(width < 700 ? 'ur. 14.03.2014' : '14.03.2014');
    await expect(full.locator('.pt-demographic')).toHaveText(['12 lat', 'Kobieta']);
    await expect(savedAge.locator('.pt-demographic')).toHaveText(['12 lat w zapisie', 'Mężczyzna']);
    await expect(year.locator('.pt-demographic')).toHaveText(['Kobieta']);
    await expect(year.locator(width < 700 ? '.pt-mobile-birth' : '.pt-birth')).toContainText('2016');
    if (width < 700) {
      await expect(full.locator('.pt-saved')).toBeHidden();
      await expect(year.locator('.pt-badge')).toBeHidden();
    }
  }
  expect(await frame.evaluate(async id => {
    const record = await window.VildaVault.getPatient(id);
    return { age: record.header.age, months: record.header.ageMonths };
  }, ids.full)).toEqual({ age: 8, months: 5 });
});

test('Start i ponowne otwarcie zachowują miejsce w Bazie tylko w tej samej odblokowanej sesji', async ({ page }) => {
  await page.setViewportSize({ width: 699, height: 844 });
  const { frame, database } = await przygotujBaze(page);
  await database.locator('[data-filter="base"]').click();
  await database.locator('.pt-search input').fill('Lista');
  await sortuj(frame, 'name-desc');
  await expect(database.locator('.pt-row')).toHaveCount(19);
  await database.locator('.pt-scroll').evaluate(node => { node.scrollTop = 350; });
  const before = await database.locator('.pt-scroll').evaluate(node => ({
    scroll: node.scrollTop, order: [...node.querySelectorAll('.pt-row')].map(row => row.dataset.patientId),
  }));
  expect(before.scroll).toBeGreaterThan(100);
  await database.locator('.pt-home').click();
  await expect(database).toHaveCount(0);
  await openDatabase(page, frame);
  await expect(database.locator('.pt-search input')).toHaveValue('Lista');
  await expect(database.locator('[data-filter="base"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(database.locator('.pt-sortopt[data-s="name-desc"]')).toHaveAttribute('aria-checked', 'true');
  await expect.poll(() => database.locator('.pt-scroll').evaluate(node => ({
    scroll: node.scrollTop, order: [...node.querySelectorAll('.pt-row')].map(row => row.dataset.patientId),
  }))).toEqual(before);
  await database.locator('.pt-home').click();
  const userId = await frame.evaluate(() => window.VildaVault.getCurrentUser().userId);
  await frame.evaluate(() => window.VildaVault.lock());
  await expect(frame.locator('.vilda-auth-root')).toBeVisible();
  await frame.evaluate(async id => {
    // This is the same ephemeral fictional account created by the fixture.
    await window.VildaVault.unlockUser(id, 'E2e#SiatkaNowyPomiar!2026');
    window.VildaAuthUI.hide();
  }, userId);
  await openDatabase(page, frame);
  await expect(database.locator('.pt-search input')).toHaveValue('');
  await expect(database.locator('[data-filter="all"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(database.locator('.pt-row')).toHaveCount(24);
  expect(await database.locator('.pt-scroll').evaluate(node => node.scrollTop)).toBe(0);
});

test('desktop: nagłówki formularza pozostają pod Bazą, a pełne Przypomnienia nadal się otwierają', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await createFictionalVault(page);
  const inlineHeader = page.locator('#remindersInline .vb22-head');
  await expect(inlineHeader).toBeVisible();
  const background = page.locator('body > .desktop-layout > .main-content');
  const originalIsolation = await background.evaluate(node => getComputedStyle(node).isolation);

  for (const width of [1440, 1920]) {
    await page.setViewportSize({ width, height: 1000 });
    await openDatabase(page, page);
    await expect(page.locator('.pt-row')).toHaveCount(2);
    await navigationIsAccessible(page, page);
    // isVisible alone accepts an overlapped element. Check the exact region
    // where the local reminder heading used to punch through the database.
    const overlap = await inlineHeader.evaluate(node => {
      const box = node.getBoundingClientRect();
      const x = box.left + box.width / 2, y = box.top + box.height / 2;
      const foreground = document.elementFromPoint(x, y);
      return { width: box.width, height: box.height, inViewport: y >= 0 && y < innerHeight,
        databaseOnTop: Boolean(foreground?.closest('.vilda-auth-root.vilda-auth-database')) };
    });
    expect(overlap.width).toBeGreaterThan(100);
    expect(overlap.height).toBeGreaterThan(20);
    expect(overlap.inViewport).toBe(true);
    expect(overlap.databaseOnTop, 'osadzony nagłówek nie przebija nad Bazą').toBe(true);
    await sortuj(page, 'name-desc');
    await expect(page.locator('.pt-sortopt[data-s="name-desc"]')).toHaveAttribute('aria-checked', 'true');

    await page.locator('#vildaRemindersBtn').click();
    const full = page.locator('dialog.vb22-modal');
    await expect(full).toBeVisible();
    await full.locator('.vb22-tabs [data-tab="search"]').click();
    await expect(full.locator('.vb22-tabs [data-tab="search"]')).toHaveAttribute('aria-pressed', 'true');
    await full.locator('.vb22-exit').click();
    await expect(full).toBeHidden();
    await expect(page.locator('.vilda-patient-database')).toBeVisible();
    await page.locator('.pt-home').click();
    await expect(page.locator('.vilda-patient-database')).toHaveCount(0);
    await expect.poll(() => background.evaluate(node => getComputedStyle(node).isolation)).toBe(originalIsolation);
    expect(await inlineHeader.evaluate(node => {
      const box = node.getBoundingClientRect();
      return node.contains(document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2));
    }), 'po powrocie osadzona karta ponownie jest dostępna').toBe(true);
  }
});
