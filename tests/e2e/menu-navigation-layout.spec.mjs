import { devices } from '@playwright/test';
import { expect, test } from '../support/test-czas.mjs';
import { createFictionalVault, loadPatient, shellFrame } from '../support/centile-live-fixture.mjs';
import { czekajNaOdtworzenieSesji } from '../support/sesja-czekanie.mjs';

// B4: production chrome, actual routes and an isolated fictional vault. No
// substituted markup, event handlers or layout styles.
test.use({ serviceWorkers: 'block', reducedMotion: 'reduce' });

const DRAWER = '[data-vilda-chrome-drawer]';
const TRIGGER = '[data-vilda-chrome-menu-btn]';
const DESKTOP = 'aside.sidebar-v2 .sidebar-inner';

async function prepare(page, { shell = false } = {}) {
  await page.route('**/*', route => {
    const url = new URL(route.request().url());
    return url.hostname === '127.0.0.1' || /^(data|blob):$/.test(url.protocol)
      ? route.continue() : route.abort();
  });
  const created = await createFictionalVault(page, { shell });
  const consent = page.locator('#consent-decline');
  if (await consent.isVisible()) await consent.click();
  await loadPatient(created.frame, created.ids.a, 'restore', { clear: true });
  await page.evaluate(() => document.fonts.ready);
  return created;
}

async function geometry(menu) {
  const selectors = {
    save: '.chrome-menu-save', documents: '.chrome-menu-documents',
    actions: '.chrome-menu-actions', footer: '.chrome-menu-footer',
  };
  for (const selector of Object.values(selectors)) await expect(menu.locator(selector)).toBeVisible();
  return menu.evaluate((root, selectors) => Object.fromEntries(Object.entries(selectors).map(([name, selector]) => {
    const element = root.querySelector(selector), rect = element.getBoundingClientRect();
    return [name, { x: rect.x, y: rect.y, width: rect.width, height: rect.height,
      transform: getComputedStyle(element).transform }];
  })), selectors);
}

function expectPinned(actual, baseline) {
  for (const [name, rect] of Object.entries(baseline)) {
    expect(rect.width, `${name}: rzeczywista szerokość`).toBeGreaterThan(0);
    expect(rect.height, `${name}: rzeczywista wysokość`).toBeGreaterThan(0);
    for (const key of ['x', 'y', 'width', 'height']) {
      expect(Math.abs(actual[name][key] - rect[key]), `${name}/${key} nie zmienia się przy przewijaniu: ${JSON.stringify(rect)} → ${JSON.stringify(actual[name])}`).toBeLessThanOrEqual(1);
    }
  }
}

async function expandCalculators(menu, keyboard = false) {
  const toggle = menu.locator('.chrome-menu-calculators-toggle');
  await expect(toggle).toBeVisible();
  if (await toggle.getAttribute('aria-expanded') !== 'true') {
    if (keyboard) { await toggle.focus(); await toggle.press('Enter'); }
    else await toggle.click();
  }
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  await expect(menu.locator('.chrome-menu-calculators-items')).toBeVisible();
  return toggle;
}

async function scrollMenu(menu) {
  const scroll = menu.locator('.chrome-menu-scroll');
  const structure = await scroll.evaluate(node => ({
    height: node.clientHeight, total: node.scrollHeight,
    containsActions: Boolean(node.querySelector('.chrome-menu-actions')),
    containsFooter: Boolean(node.querySelector('.chrome-menu-footer')),
  }));
  expect(structure.containsActions, 'akcje nie należą do przewijanej treści').toBe(false);
  expect(structure.containsFooter, 'konto nie należy do przewijanej treści').toBe(false);
  expect(structure.total, 'warunek próby: menu rzeczywiście wymaga przewinięcia').toBeGreaterThan(structure.height + 1);
  await scroll.evaluate(node => { node.scrollTop = node.scrollHeight; });
  await expect.poll(() => scroll.evaluate(node => node.scrollTop)).toBeGreaterThan(1);
  return scroll;
}

async function expectNoHorizontalOverflow(page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
}

for (const width of [1024, 1280, 1920]) {
  test(`desktop ${width}: akcje i konto pozostają przypięte przy przewijaniu menu oraz strony do stopki`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 720 });
    await prepare(page);
    const menu = page.locator(DESKTOP);
    await expect(menu).toBeVisible();
    await expect(menu.locator('a[href="ustawienia.html"]')).toHaveCount(1);
    const baseline = await geometry(menu);
    const layout = await menu.evaluate(root => {
      const rect = root.getBoundingClientRect();
      const header = document.querySelector('body > header').getBoundingClientRect();
      return { top: rect.top, bottom: rect.bottom, headerBottom: header.bottom, viewport: innerHeight };
    });
    expect(Math.abs(layout.top - layout.headerBottom), 'menu zaczyna się bezpośrednio pod nagłówkiem').toBeLessThanOrEqual(1);
    expect(Math.abs(layout.bottom - layout.viewport), 'menu sięga do dolnej krawędzi okna').toBeLessThanOrEqual(1);

    await expandCalculators(menu);
    const scroll = await scrollMenu(menu);
    expectPinned(await geometry(menu), baseline);
    await page.evaluate(() => window.scrollTo({ top: document.scrollingElement.scrollHeight, behavior: 'instant' }));
    await expect.poll(() => page.evaluate(() => scrollY)).toBeGreaterThan(100);
    await expect(page.locator('body > footer')).toBeInViewport();
    expectPinned(await geometry(menu), baseline);
    await expect(menu.locator('.chrome-menu-footer')).toBeInViewport();
    await expect.poll(() => menu.locator('.chrome-menu-footer').evaluate(node => {
      const rect = node.getBoundingClientRect();
      return node.contains(document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2));
    }), { message: 'stopka strony nie zasłania przypiętego konta' }).toBe(true);
    for (const selector of ['.chrome-menu-save', '.chrome-menu-footer [data-menu-account]',
      '.chrome-menu-footer a[href="ustawienia.html"]', '.chrome-menu-footer [data-menu-logout]']) {
      const control = menu.locator(selector);
      await expect(control).toBeVisible();
      await expect.poll(() => control.evaluate(node => {
        const rect = node.getBoundingClientRect();
        return node.contains(document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2));
      }), { message: `${selector}: rzeczywista kontrolka dostępna nad stopką i dolnym dockiem` }).toBe(true);
    }
    await expect(menu.locator('.chrome-menu-save')).toBeInViewport();
    await expectNoHorizontalOverflow(page);
    await testInfo.attach('pinned-menu.json', {
      body: JSON.stringify({ width, layout, baseline, after: await geometry(menu),
        scroll: await scroll.evaluate(node => ({ top: node.scrollTop, height: node.clientHeight, total: node.scrollHeight })) }),
      contentType: 'application/json',
    });
  });
}

for (const profile of [
  { name: 'telefon pionowo', width: 390, height: 852 },
  { name: 'telefon poziomo', width: 844, height: 390 },
]) {
  test.describe(profile.name, () => {
    const phone = devices['iPhone 15 Pro'];
    test.use({
      viewport: { width: profile.width, height: profile.height },
      screen: { width: profile.width, height: profile.height },
      userAgent: phone.userAgent, deviceScaleFactor: phone.deviceScaleFactor,
      isMobile: phone.isMobile, hasTouch: phone.hasTouch,
    });

    test('drawer: przypięte akcje/konto, accordion z klawiatury i rzeczywiste przejście do kalkulatora', async ({ page }) => {
      await prepare(page, { shell: true });
      const trigger = page.locator(TRIGGER);
      await trigger.focus(); await page.keyboard.press('Enter');
      const menu = page.locator(`${DRAWER} .chrome-drawer-body`);
      await expect(page.locator(DRAWER)).toHaveAttribute('aria-hidden', 'false');
      await expect(page.locator(`${DRAWER} .chrome-drawer-panel`)).toHaveCSS('transform', 'none');
      const baseline = await geometry(menu);
      const toggle = await expandCalculators(menu, true);
      await expect(toggle).toBeFocused();
      await toggle.press('Space');
      await expect(toggle).toHaveAttribute('aria-expanded', 'false');
      await expect(menu.locator('.chrome-menu-calculators-items')).toBeHidden();
      await toggle.press('Enter');
      await expect(toggle).toHaveAttribute('aria-expanded', 'true');
      await scrollMenu(menu);
      expectPinned(await geometry(menu), baseline);
      await expect(menu.locator('.chrome-menu-save')).toBeInViewport();
      await expect(menu.locator('.chrome-menu-footer')).toBeInViewport();
      await expectNoHorizontalOverflow(page);

      await page.keyboard.press('Escape');
      await expect(page.locator(DRAWER)).toBeHidden(); await expect(trigger).toBeFocused();
      await trigger.press('Enter');
      await expandCalculators(menu, true);
      await menu.locator('a[href="homa-ir.html"]').focus();
      await page.keyboard.press('Enter');
      await expect(page).toHaveURL(/#\/homa$/);
      await expect(page.locator(DRAWER)).toBeHidden();
      const homa = await shellFrame(page, 'HOMA-IR');
      await expect(homa.locator('#glucose')).toBeVisible();
      await expect.poll(() => page.evaluate(() => document.activeElement === document.querySelector('iframe.app-pane:not([hidden])'))).toBe(true);
      await expectNoHorizontalOverflow(page);
    });
  });
}

test('shell: Zapisz zapisuje aktywny DocPro, Karta i Baza zachowują pacjenta, a Notatnik otwiera szablony', async ({ page }) => {
  test.setTimeout(120_000);
  const created = await prepare(page, { shell: true });
  const menu = page.locator(DESKTOP);
  await menu.locator('a[href="docpro.html"]').click();
  await expect(page).toHaveURL(/#\/docpro$/);
  const docpro = await shellFrame(page, 'DocPro');
  await docpro.waitForFunction(() => window.VildaAuthUI?.isBootReady() && window.VildaProAccess);
  await docpro.evaluate(() => {
    window.VildaProAccess.__setTokenModeForTest(false);
    window.VildaProAccess.setPlan('pro', '2099-12-31T23:59:59.000Z');
    document.dispatchEvent(new CustomEvent('vildaProAccessChanged', { detail: { plan: 'pro' } }));
  });
  const confirm = docpro.getByRole('button', { name: 'Potwierdzam', exact: true });
  if (await confirm.isVisible()) await confirm.click();
  await czekajNaOdtworzenieSesji(docpro);
  await docpro.waitForFunction(() => !window.__vildaPersistRestoring && !window.__vildaLustroWpis
    && !window.VildaDataImportExport.isMainSessionRestorePending()
    && !window.VildaDataImportExport.isMainSessionAutosavePaused());
  await expect(docpro.locator('#firstName')).toHaveValue('Antoni');
  await expect.poll(() => docpro.evaluate(() => window._vildaCurrentPatientId || sessionStorage.getItem('vildaCurrentPatientId'))).toBe(created.ids.a);
  await docpro.evaluate(() => { window.__menuNavigationSource = 'fictional-docpro-document'; });
  const before = await docpro.evaluate(async id => (await window.VildaVault.getPatient(id)).snapshots.length, created.ids.a);
  await docpro.locator('#weight').fill('47.2'); await docpro.locator('#weight').blur();
  await expect.poll(() => docpro.evaluate(() => window.VildaSaveStatusIndicator.getCurrentDecision().ready)).toBe(true);
  await expect(menu.locator('.chrome-menu-save')).not.toHaveAttribute('aria-disabled', 'true');
  await menu.locator('.chrome-menu-save').click();
  await expect.poll(() => docpro.evaluate(async id => {
    const patient = await window.VildaVault.getPatient(id);
    return { count: patient.snapshots.length, weight: Number(patient.snapshots[0].payload.user.weight) };
  }, created.ids.a)).toEqual({ count: before + 1, weight: 47.2 });
  await expect(page).toHaveURL(/#\/docpro$/);

  await menu.locator('.chrome-menu-patient-open').click();
  await expect(page).toHaveURL(/#\/start$/);
  const card = created.frame.locator('.vilda-auth-patient-card');
  await expect(card.locator('.vilda-patient-hero-name')).toHaveText(created.patients.a.name);
  await created.frame.getByRole('button', { name: '← DocPro', exact: true }).click();
  await expect(page).toHaveURL(/#\/docpro$/);
  await expect(docpro.locator('#weight')).toHaveValue('47.2');
  expect(await docpro.evaluate(() => window.__menuNavigationSource)).toBe('fictional-docpro-document');

  await menu.locator('#patientsListBtnSidebar').click();
  await expect(page).toHaveURL(/#\/start$/);
  const list = created.frame.locator('#vilda-auth-ui-root');
  await expect(list.getByText(created.patients.a.name, { exact: true })).toBeVisible();
  await expect(list.getByText(created.patients.b.name, { exact: true })).toBeVisible();
  await list.getByRole('button', { name: 'Strona główna', exact: true }).click();
  await expect(list).toBeHidden();
  await menu.locator('a[href="docpro.html"]').click();
  await expect(page).toHaveURL(/#\/docpro$/);
  await expect(docpro.locator('#firstName')).toHaveValue('Antoni');

  const notesBefore = await docpro.evaluate(async () => (await window.VildaVault.listAllPatientNotes()).length);
  await menu.getByRole('link', { name: 'Notatnik', exact: true }).click();
  await expect(page).toHaveURL(/#\/notatki$/);
  const notebook = await shellFrame(page, 'Notatnik');
  await notebook.waitForFunction(() => window.VildaAuthUI?.isBootReady() && window.VildaProAccess);
  await notebook.evaluate(() => {
    window.VildaProAccess.__setTokenModeForTest(false);
    window.VildaProAccess.setPlan('pro', '2099-12-31T23:59:59.000Z');
    document.dispatchEvent(new CustomEvent('vildaProAccessChanged', { detail: { plan: 'pro' } }));
  });
  await notebook.locator('#notesNewBtn').click();
  const editor = notebook.locator('#noteEditorOverlay'); await expect(editor).toBeVisible();
  await notebook.locator('#noteFieldTitle').fill('Fikcyjny szablon nawigacji');
  await notebook.locator('#noteFieldBody').fill('Szablon fikcyjnego testu nawigacji.');
  await notebook.locator('#noteEditorSave').click(); await expect(editor).toBeHidden();
  await expect(notebook.locator('.note-card', { hasText: 'Fikcyjny szablon nawigacji' })).toBeVisible();
  expect(await notebook.evaluate(async () => (await window.VildaVault.listNotes()).some(note =>
    note.title === 'Fikcyjny szablon nawigacji' && note.body === 'Szablon fikcyjnego testu nawigacji.'))).toBe(true);
  expect(await notebook.evaluate(async () => (await window.VildaVault.listAllPatientNotes()).length)).toBe(notesBefore);
  const settings = menu.locator('.chrome-menu-footer a[href="ustawienia.html"]');
  await expect(menu.locator('a[href="ustawienia.html"]')).toHaveCount(1);
  await settings.click();
  await expect(page).toHaveURL(/#\/ustawienia$/);
  await expect((await shellFrame(page, 'Ustawienia')).locator('#settings-section-account')).toBeVisible();
});
