import { devices, expect, test } from '@playwright/test';

// A4: konto otwieramy przez rzeczywisty nagłówek, z fikcyjnym lokalnym sejfem.
// Pola i wynik HOMA mają pozostać w tym samym dokumencie utrzymywanej ramki.
// Daty nie są przedmiotem testu; rzeczywisty RAF/IntersectionObserver pozostaje
// aktywny także podczas pełnej nawigacji klawiaturą między dokumentami.
test.use({ serviceWorkers: 'block' });

async function konto(page) {
  await page.route('**/*', (route) => {
    const url = new URL(route.request().url());
    return url.hostname === '127.0.0.1' || /^(data|blob):$/.test(url.protocol)
      ? route.continue() : route.abort();
  });
  await page.addInitScript(() => localStorage.setItem('vilda-terms-accepted-v1',
    JSON.stringify({ version: 1, acceptedAtISO: new Date().toISOString() })));
  await page.goto('/index.html', { waitUntil: 'load' });
  await page.waitForFunction(() => Boolean(window.VildaVault));
  await page.evaluate(() => window.VildaVault.createUser('E2e#KontoStanNarzedzi!26',
    { label: 'Fikcyjne konto zachowania narzędzi', iterations: 10000 }));
  await page.reload({ waitUntil: 'load' });
  await odblokowany(page);
  await cookies(page);
}

async function odblokowany(ctx) {
  await expect.poll(() => ctx.evaluate(() => Boolean(window.VildaVault?.isUnlocked()
    && !document.documentElement.classList.contains('vilda-auth-locked'))),
  { message: 'sejf i interfejs dokumentu są odblokowane' }).toBe(true);
}

async function cookies(ctx) {
  const odmowa = ctx.locator('#consent-decline');
  if (await odmowa.isVisible()) await odmowa.click();
}

async function ramka(page, title) {
  const element = page.locator(`iframe.app-pane[title="${title}"]`);
  await expect(element).toBeVisible();
  const frame = await (await element.elementHandle()).contentFrame();
  await frame.waitForLoadState('load');
  await odblokowany(frame);
  return frame;
}

async function nawigacja(page, href) {
  const sidebar = page.locator(`.sidebar-nav a[href="${href}"]`);
  if (await sidebar.isVisible()) { await sidebar.click(); return; }
  await page.locator('[data-vilda-chrome-menu-btn]').click();
  const menu = page.locator('[data-vilda-chrome-drawer]');
  await menu.locator(`.chrome-drawer-nav a[href="${href}"]`).click();
  // Zamykanie menu ma osobną regresję A5. Bazowy RED A4 musi móc wrócić
  // do formularza także przed naprawą A5, przez istniejący przycisk użytkownika.
  if (await menu.getAttribute('aria-hidden') === 'false') {
    await menu.locator('button[data-vilda-chrome-drawer-close]').click();
  }
  await expect(menu).not.toBeVisible();
}

async function kliknijKonto(ctx, preferred = 'avatar', keyboard = false, noWaitAfter = false) {
  let control = ctx.locator(preferred === 'name' ? '#vildaUserValue' : '#vildaUserAvatar');
  // Przy szerokości telefonu nazwa jest celowo ukryta razem z .chip-content.
  // Klikamy osiągalny avatar; nie odsłaniamy ukrytego nagłówka CSS-em.
  if (preferred === 'name' && !(await control.isVisible())) {
    await expect(control).not.toBeVisible();
    control = ctx.locator('#vildaUserAvatar');
    keyboard = false;
  }
  await expect(control).toBeVisible();
  if (keyboard) {
    await control.focus();
    await control.press('Enter');
  } else await control.click({ noWaitAfter });
}

async function homa(page) {
  await page.goto('/app.html#/homa', { waitUntil: 'load' });
  await cookies(page);
  const frame = await ramka(page, 'HOMA-IR');
  await frame.locator('#glucoseUnit').selectOption('mg');
  await frame.locator('#glucose').fill('90');
  await frame.locator('#insulin').fill('12');
  await frame.locator('#insulin').blur();
  await expect(frame.locator('#wynik')).toContainText('2.66');
  const result = await frame.locator('#wynik').innerText();
  await page.evaluate(() => {
    const f = document.querySelector('iframe.app-pane[title="HOMA-IR"]');
    window.__e2eHomaElement = f;
    window.__e2eHomaDocument = f.contentDocument;
    window.__e2eHomaWindow = f.contentWindow;
  });
  return { frame, result };
}

async function zachowanaHoma(page, previous) {
  await expect(page).toHaveURL(/\/app\.html#\/homa$/);
  await expect(page.locator('iframe.app-pane[title="HOMA-IR"]')).toBeVisible();
  expect(await page.evaluate(() => {
    const f = document.querySelector('iframe.app-pane[title="HOMA-IR"]');
    return f === window.__e2eHomaElement
      && f.contentDocument === window.__e2eHomaDocument
      && f.contentWindow === window.__e2eHomaWindow;
  }), 'tożsamość elementu, dokumentu i okna HOMA nie zmieniła się').toBe(true);
  await expect(previous.frame.locator('#glucose')).toHaveValue('90');
  await expect(previous.frame.locator('#insulin')).toHaveValue('12');
  await expect(previous.frame.locator('#glucoseUnit')).toHaveValue('mg');
  await expect(previous.frame.locator('#wynik')).toHaveText(previous.result);
}

async function sekcjaKonta(ctx) {
  const section = ctx.locator('#settings-section-account');
  await expect(section).not.toHaveClass(/settings-accordion--locked/);
  await expect(section).toHaveAttribute('open', '');
  await expect(section.locator('summary')).toBeInViewport();
  await expect(ctx.locator('#changePasswordBtn')).toBeEnabled();
}

function scenariuszeKonta() {
  test('host avatar → zimne Ustawienia → menu: konto zostaje w powłoce i HOMA zachowuje stan', async ({ page }) => {
    await konto(page);
    const previous = await homa(page);
    let zwolnij;
    let odczytSettings = false;
    const bramka = new Promise((resolve) => { zwolnij = resolve; });
    await page.route('**/ustawienia.html*', async (route) => {
      odczytSettings = true;
      await bramka;
      await route.continue();
    });
    const klik = kliknijKonto(page, 'avatar', false, true);
    try {
      await expect.poll(() => odczytSettings,
        { message: 'odpowiedź dokumentu Ustawień oczekuje, gdy nagłówek wysyła cel konta' }).toBe(true);
    }
    finally { zwolnij(); }
    await klik;
    await expect(page).toHaveURL(/\/app\.html#\/ustawienia$/);
    await sekcjaKonta(await ramka(page, 'Ustawienia'));
    await nawigacja(page, 'homa-ir.html');
    await zachowanaHoma(page, previous);
  });

  test('host nazwa/Enter → ciepłe Ustawienia: cel konta i Back/Forward zachowują HOMA', async ({ page }) => {
    await konto(page);
    const previous = await homa(page);
    await nawigacja(page, 'ustawienia.html');
    const settings = await ramka(page, 'Ustawienia');
    await settings.locator('#settings-section-appearance summary').click();
    await expect(settings.locator('#settings-section-appearance')).toHaveAttribute('open', '');
    await expect(settings.locator('#settings-section-account')).not.toHaveAttribute('open', '');
    await page.evaluate(() => {
      window.__e2eSettingsDocument = document.querySelector('iframe.app-pane[title="Ustawienia"]').contentDocument;
    });
    await nawigacja(page, 'homa-ir.html');
    await zachowanaHoma(page, previous);
    await kliknijKonto(page, 'name', true);
    await expect(page).toHaveURL(/\/app\.html#\/ustawienia$/);
    await sekcjaKonta(settings);
    expect(await page.evaluate(() => document.querySelector('iframe.app-pane[title="Ustawienia"]').contentDocument
      === window.__e2eSettingsDocument), 'ciepły dokument Ustawień nie został przeładowany').toBe(true);
    await settings.locator('#settings-section-account summary').click();
    await expect(settings.locator('#settings-section-account')).not.toHaveAttribute('open', '');
    await page.goBack();
    await zachowanaHoma(page, previous);
    await page.goForward();
    await expect(page).toHaveURL(/\/app\.html#\/ustawienia$/);
    await sekcjaKonta(settings);
    await nawigacja(page, 'homa-ir.html');
    await zachowanaHoma(page, previous);
  });

  test('kontrola: HOMA → Steroidy → HOMA przez zwykłe menu zachowuje ten sam formularz', async ({ page }) => {
    await konto(page);
    const previous = await homa(page);
    await nawigacja(page, 'steroidy.html');
    await expect(page).toHaveURL(/\/app\.html#\/steroidy$/);
    await nawigacja(page, 'homa-ir.html');
    await zachowanaHoma(page, previous);
  });

  for (const [path, control, keyboard] of [
    ['/index.html', 'name', false],
    ['/docpro.html', 'avatar', false],
    ['/homa-ir.html', 'name', true],
  ]) {
    test(`standalone ${path}: nagłówek nadal otwiera samodzielną sekcję konta`, async ({ page }) => {
      await konto(page);
      await page.goto(path, { waitUntil: 'load' });
      await odblokowany(page);
      await cookies(page);
      await kliknijKonto(page, control, keyboard);
      await expect(page).toHaveURL(/\/ustawienia\.html#settings-section-account$/);
      await page.waitForLoadState('load');
      await odblokowany(page);
      await sekcjaKonta(page);
    });
  }
}

test.describe('desktop: konto i zachowanie narzędzi', () => {
  scenariuszeKonta();
});

test.describe('telefon: konto i zachowanie narzędzi', () => {
  const phone = devices['iPhone 15 Pro'];
  test.use({
    viewport: phone.viewport,
    screen: phone.screen,
    userAgent: phone.userAgent,
    deviceScaleFactor: phone.deviceScaleFactor,
    isMobile: phone.isMobile,
    hasTouch: phone.hasTouch,
  });
  scenariuszeKonta();
});
