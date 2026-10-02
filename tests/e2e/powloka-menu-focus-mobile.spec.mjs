import { expect, test } from '../support/test-czas.mjs';

// P-POWLOKA-MENU: rzeczywiste kliknięcia i klawiatura w hoście oraz standalone.
// Wyłącznie fikcyjny sejf; bez zmian handlerów, atrap modali i testowania trybu gościa.
test.use({ serviceWorkers: 'block' });

const MENU = '[data-vilda-chrome-drawer]';
const TRIGGER = '[data-vilda-chrome-menu-btn]';
const PANEL = `${MENU} [role="dialog"]`;
const HASLO = 'E2e#FikcyjneMenuFocus!26';

async function przygotuj(page, { host = true, width = 393, reduce = false } = {}) {
  await page.setViewportSize({ width, height: 852 });
  await page.emulateMedia({ reducedMotion: reduce ? 'reduce' : 'no-preference' });
  await page.route('**/*', (route) => {
    const url = new URL(route.request().url());
    return url.hostname === '127.0.0.1' || /^(data|blob):$/.test(url.protocol)
      ? route.continue() : route.abort();
  });
  await page.addInitScript(() => {
    localStorage.setItem('vilda-terms-accepted-v1',
      JSON.stringify({ version: 1, acceptedAtISO: new Date().toISOString() }));
    localStorage.setItem('vilda-spa-shell-v1', 'off'); // kontrola prawdziwych stron standalone
  });
  await page.goto('/index.html', { waitUntil: 'load' });
  await page.waitForFunction(() => Boolean(window.VildaVault));
  await page.evaluate(async (haslo) => window.VildaVault.createUser(haslo,
    { label: 'Fikcyjne konto testu menu', iterations: 10000 }), HASLO);
  await page.goto(host ? '/app.html#/homa' : '/index.html', { waitUntil: 'load' });
  await expect(page.locator(TRIGGER)).toBeVisible();
  const baner = page.locator('#consent-decline');
  if (await baner.isVisible()) await baner.click();
  if (host) await expect(page.locator('iframe.app-pane[title="HOMA-IR"]')).toBeVisible();
  else await page.waitForFunction(() => window.VildaVault?.isUnlocked());
}

async function otworz(page, keyboard = false) {
  if (keyboard) {
    await page.locator(TRIGGER).focus();
    await page.keyboard.press('Enter');
  } else await page.locator(TRIGGER).click();
  await expect(page.locator(MENU)).toBeVisible();
  await expect(page.locator(MENU)).toHaveAttribute('aria-hidden', 'false');
}

async function zamkniete(page) {
  await expect(page.locator(MENU)).toHaveAttribute('aria-hidden', 'true');
  await expect(page.locator(MENU)).toHaveAttribute('hidden', '');
  await expect(page.locator('body')).not.toHaveClass(/chrome-drawer-open/);
  await expect(page.locator(TRIGGER)).toHaveAttribute('aria-expanded', 'false');
}

const fokusWMenu = (page) => page.evaluate((selector) => {
  const active = document.activeElement;
  return Boolean(active && document.querySelector(selector)?.contains(active)
    && active.getClientRects().length && getComputedStyle(active).visibility !== 'hidden');
}, PANEL);

async function klawiatura(page) {
  await expect.poll(() => fokusWMenu(page), { message: 'otwarcie przenosi focus do dialogu menu' }).toBe(true);
  await expect(page.locator(TRIGGER)).toHaveAttribute('aria-expanded', 'true');
  await expect(page.locator(PANEL)).toHaveAttribute('aria-modal', 'true');
  const skraje = await page.locator(PANEL).evaluate((dialog) => {
    const controls = [...dialog.querySelectorAll('a[href],button,input,select,textarea,[tabindex]')]
      .filter((el) => el.tabIndex >= 0 && !el.disabled
        && el.getClientRects().length && getComputedStyle(el).visibility !== 'hidden');
    const all = [...dialog.querySelectorAll('a[href],button,input,select,textarea,[tabindex]')];
    return { first: all.indexOf(controls[0]), last: all.indexOf(controls.at(-1)), count: controls.length };
  });
  expect(skraje.count, 'kontrola: w menu są dostępne kontrolki').toBeGreaterThan(2);
  const controls = page.locator(`${PANEL} a[href],${PANEL} button,${PANEL} input,${PANEL} select,${PANEL} textarea,${PANEL} [tabindex]`);
  await controls.nth(skraje.last).focus();
  await page.keyboard.press('Tab');
  await expect.poll(() => fokusWMenu(page), { message: 'Tab na końcu nie przechodzi do tła/iframe' }).toBe(true);
  await expect(controls.nth(skraje.first), 'Tab naprawdę przechodzi do pierwszej kontrolki').toBeFocused();
  await controls.nth(skraje.first).focus();
  await page.keyboard.press('Shift+Tab');
  await expect.poll(() => fokusWMenu(page), { message: 'Shift+Tab na początku nie przechodzi do nagłówka' }).toBe(true);
  await expect(controls.nth(skraje.last), 'Shift+Tab naprawdę przechodzi do ostatniej kontrolki').toBeFocused();
  for (const key of ['Tab', 'Tab', 'Shift+Tab', 'Shift+Tab']) {
    await page.keyboard.press(key);
    expect(await fokusWMenu(page), `focus po ${key} zostaje w widocznym dialogu`).toBe(true);
  }
}

async function szerokosc(page) {
  const pomiar = await page.evaluate(() => {
    const iframe = [...document.querySelectorAll('iframe.app-pane')].find((el) => !el.hidden);
    return { host: document.documentElement.scrollWidth, viewport: innerWidth,
      panel: iframe?.contentDocument?.documentElement.scrollWidth,
      panelViewport: iframe?.contentWindow?.innerWidth };
  });
  expect(pomiar.host, 'brak poziomego przewijania strony/menu').toBeLessThanOrEqual(pomiar.viewport + 1);
  if (pomiar.panel !== undefined) expect(pomiar.panel, 'brak poziomego przewijania aktywnej ramki')
    .toBeLessThanOrEqual(pomiar.panelViewport + 1);
}

const tlo = (page) => page.evaluate(() => ['header', '.desktop-layout', '#mobileBottomDock',
  'iframe.app-pane[title="HOMA-IR"]'].map((selector) => {
  const el = document.querySelector(selector);
  return { selector, inert: el?.getAttribute('inert') ?? null,
    tabindex: el?.getAttribute('tabindex') ?? null, ariaHidden: el?.getAttribute('aria-hidden') ?? null };
}));

test('host 393 px: wybór nowej i aktualnej trasy zamyka menu, focus oddaje panelowi i zachowuje HOMA', async ({ page }) => {
  await przygotuj(page);
  const homa = page.frameLocator('iframe.app-pane[title="HOMA-IR"]');
  await homa.locator('#glucose').fill('90');
  await homa.locator('#insulin').fill('12');
  for (const [key, file, title] of [
    ['ustawienia', 'ustawienia.html', 'Ustawienia'],
    ['lab', 'przelicznik-jednostek.html', 'Jednostki laboratoryjne'],
    ['lab', 'przelicznik-jednostek.html', 'Jednostki laboratoryjne'],
    ['homa', 'homa-ir.html', 'HOMA-IR'],
  ]) {
    await otworz(page);
    await page.locator(`${MENU} a[href="${file}"]`).click();
    await expect(page).toHaveURL(new RegExp(`#/${key}$`));
    await expect(page.locator('iframe.app-pane:not([hidden])')).toHaveAttribute('title', title);
    await zamkniete(page);
    await expect.poll(() => page.evaluate(() => {
      const iframe = document.querySelector('iframe.app-pane:not([hidden])');
      return document.activeElement === iframe;
    }), { message: 'focus przechodzi do widocznej ramki, nie zostaje w ukrytym menu' }).toBe(true);
    await szerokosc(page);
  }
  await expect(homa.locator('#glucose')).toHaveValue('90');
  await expect(homa.locator('#insulin')).toHaveValue('12');
  await homa.locator('#glucose').fill('91');
  await expect(homa.locator('#glucose')).toHaveValue('91'); // tło znów przyjmuje rzeczywistą edycję
});

test('host 393 px: Tab/Shift+Tab, Escape/przycisk/tło i szybkie reopen przywracają focus oraz atrybuty tła', async ({ page }) => {
  await przygotuj(page);
  const przed = await tlo(page);
  await otworz(page, true);
  await klawiatura(page);
  await szerokosc(page);
  for (const metoda of ['Escape', 'przycisk', 'tlo']) {
    if (metoda === 'Escape') await page.keyboard.press('Escape');
    else if (metoda === 'przycisk') await page.getByRole('button', { name: 'Zamknij menu', exact: true }).click();
    else await page.locator(`${MENU} .chrome-drawer-backdrop`).click({ position: { x: 390, y: 450 } });
    await zamkniete(page);
    await expect(page.locator(TRIGGER)).toBeFocused();
    expect(await tlo(page), 'wcześniejsze atrybuty tła są przywrócone').toEqual(przed);
    await otworz(page, true);
  }
  // Zamknięcie i ponowne otwarcie przed zakończeniem animacji: timer poprzedniego
  // zamknięcia nie może schować aktualnie otwartego dialogu.
  await page.getByRole('button', { name: 'Zamknij menu', exact: true }).click();
  await page.locator(TRIGGER).focus();
  await page.keyboard.press('Enter');
  await expect(page.locator(MENU)).toHaveAttribute('aria-hidden', 'false');
  await klawiatura(page);
  const reopenedAt = await page.evaluate(() => performance.now());
  // Negatywna kontrola starego cleanup (320 ms): obserwujemy stan także po jego
  // deadline. Zwykłe oczekiwanie na otwarcie mogłoby skończyć się przed tym timerem.
  await expect.poll(() => page.evaluate(({ selector, dialog, since }) => {
    const menu = document.querySelector(selector);
    return { deadline: performance.now() - since >= 400,
      open: Boolean(menu && !menu.hidden && menu.getAttribute('aria-hidden') === 'false'
        && document.body.classList.contains('chrome-drawer-open')),
      focus: Boolean(document.querySelector(dialog)?.contains(document.activeElement)) };
  }, { selector: MENU, dialog: PANEL, since: reopenedAt }),
  { message: 'po dawnym cleanup dialog nadal jest otwarty i zachowuje focus' })
    .toEqual({ deadline: true, open: true, focus: true });
  await page.keyboard.press('Escape');
  await zamkniete(page);
});

test('standalone 320 px reduced motion: blokada akcji zostawia menu, notatka przejmuje focus bez kradzieży przez drawer', async ({ page }) => {
  await przygotuj(page, { host: false, width: 320, reduce: true });
  await expect.poll(() => page.locator('#addVisitNoteBtnSidebar').getAttribute('data-tip')).toContain('Pacjenci');
  await otworz(page);
  const note = page.locator(`${MENU} [data-drawer-btn="addVisitNoteBtnSidebar"]`);
  await expect(note).toHaveAttribute('aria-disabled', 'true');
  // aria-disabled nadal przyjmuje rzeczywisty dotyk i ma wyjaśnić blokadę.
  await note.click({ force: true });
  await expect(page.locator('.menu-tooltip, .vilda-tip').first()).toBeVisible();
  await expect(page.locator(MENU)).toHaveAttribute('aria-hidden', 'false');
  await expect(page.locator('.vilda-patient-note-editor-overlay')).toHaveCount(0);
  await szerokosc(page);
  await page.getByRole('button', { name: 'Zamknij menu', exact: true }).click();
  await zamkniete(page);
  await page.evaluate(async () => {
    const zapis = await window.VildaVault.savePatient({
      name: 'Fikcyjna Pacjentka Menu', sex: 'K', age: 5.5, height: 110, weight: 19,
    });
    window._vildaCurrentPatientId = zapis.patientId;
    sessionStorage.setItem('vildaCurrentPatientId', zapis.patientId);
    document.dispatchEvent(new CustomEvent('vilda:patient-loaded', { detail: { patientId: zapis.patientId } }));
  });
  await page.locator('#age').fill('5.5');
  await page.locator('#height').fill('110');
  await page.locator('#weight').fill('19');
  await expect(page.locator('#addVisitNoteBtnSidebar')).not.toHaveAttribute('aria-disabled', 'true');
  await otworz(page);
  await note.click();
  const modal = page.locator('.vilda-patient-note-editor-overlay .vilda-pne');
  await expect(modal).toBeVisible();
  await zamkniete(page);
  await expect.poll(() => modal.evaluate((el) => el.contains(document.activeElement)),
    { message: 'zamknięcie drawer nie odbiera focus managerowi istniejącego modala' }).toBe(true);
  await modal.locator('textarea').first().fill('Fikcyjna notatka testu fokusowania');
  await page.keyboard.press('Tab');
  expect(await modal.evaluate((el) => el.contains(document.activeElement))).toBe(true);
  await szerokosc(page);
  const potwierdzenie = page.waitForEvent('dialog');
  page.once('dialog', (dialog) => dialog.accept());
  await modal.getByRole('button', { name: 'Anuluj', exact: true }).click();
  const dialog = await potwierdzenie;
  expect(dialog.type()).toBe('confirm');
  expect(dialog.message()).toBe('Odrzucić niezapisaną notatkę?');
  await expect(page.locator('.vilda-patient-note-editor-overlay')).toHaveCount(0);
  expect(await page.evaluate(async () => (await window.VildaVault.listAllPatientNotes()).length)).toBe(0);
});

test('standalone 393 px: klawiatura pozostaje w menu, anulowanie wraca do triggera, zwykły link otwiera stronę', async ({ page }) => {
  await przygotuj(page, { host: false });
  await otworz(page, true);
  await klawiatura(page);
  await page.keyboard.press('Escape');
  await zamkniete(page);
  await expect(page.locator(TRIGGER)).toBeFocused();
  await otworz(page, true);
  await page.locator(`${MENU} a[href="przelicznik-jednostek.html"]`).click();
  await expect(page).toHaveURL(/\/przelicznik-jednostek\.html$/);
  await zamkniete(page);
  expect(await page.evaluate((selector) => !document.querySelector(selector)?.contains(document.activeElement), PANEL)).toBe(true);
  await szerokosc(page);
});
