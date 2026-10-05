import { expect, test } from '../support/test-czas.mjs';

// A3: rzeczywisty baner Cole wysyła wskazanie do panelu laboratoryjnego.
// Fikcyjne konto i pacjent; bez wywoływania ani kopiowania mechanizmu routingu.
test.use({ serviceWorkers: 'block' });

async function odrzucCookies(ctx) {
  const przycisk = ctx.locator('#consent-decline');
  if (await przycisk.isVisible()) await przycisk.click();
}

async function fikcyjneKonto(page) {
  await page.addInitScript(() => {
    localStorage.setItem('vilda-terms-accepted-v1',
      JSON.stringify({ version: 1, acceptedAtISO: new Date().toISOString() }));
  });
  await page.goto('/index.html', { waitUntil: 'load' });
  await page.waitForFunction(() => Boolean(window.VildaVault));
  await page.evaluate(() => window.VildaVault.createUser('E2e#WskazanieKliniczne!26',
    { label: 'Fikcyjne konto testu wskazania klinicznego', iterations: 10000 }));
  await page.reload({ waitUntil: 'load' });
  await gotowyStart(page);
  await odrzucCookies(page);
}

async function gotowyStart(ctx) {
  await ctx.waitForFunction(() => window.VildaVault?.isUnlocked()
    && typeof window.collectUserData === 'function'
    && !document.documentElement.classList.contains('vilda-auth-locked'));
}

async function ramka(page, tytul) {
  const iframe = page.locator(`iframe.app-pane[title="${tytul}"]`);
  await expect(iframe).toBeVisible();
  const frame = await (await iframe.elementHandle()).contentFrame();
  await frame.waitForLoadState('load');
  await odrzucCookies(frame);
  return frame;
}

async function otworzPowloke(page, waitUntil = 'load') {
  await fikcyjneKonto(page);
  await page.goto('/app.html#/start', { waitUntil });
  await odrzucCookies(page);
  const start = await ramka(page, 'Start');
  await gotowyStart(start);
  return start;
}

async function banerCole(start) {
  for (const [id, value] of Object.entries({
    lastName: 'Fikcyjny', firstName: 'Wskazanie',
    age: '12', ageMonths: '0', height: '150', weight: '90',
  })) await start.locator(`#${id}`).fill(value);
  await start.locator('#sex').selectOption('M');
  await start.locator('#weight').blur();
  const link = start.locator('#coleObesityKidsBanner a');
  await expect(link).toBeVisible();
  await expect(link).toHaveAttribute('href', 'przelicznik-jednostek.html?wskazanie=obesity_kids');
  return link;
}

async function zwyklaNawigacja(page, href) {
  const sidebar = page.locator(`.sidebar-nav a[href="${href}"]`);
  if (await sidebar.isVisible()) { await sidebar.click(); return; }
  const dock = page.locator(`#mobileBottomDock a[href="${href}"]`);
  if (await dock.isVisible()) { await dock.click(); return; }
  await page.locator('[data-vilda-chrome-menu-btn]').click();
  const drawer = page.locator(`[data-vilda-chrome-drawer] .chrome-drawer-nav a[href="${href}"]`);
  await expect(drawer).toBeVisible();
  await drawer.click();
  // A5 (automatyczne zamykanie menu) jest poza zakresem tej poprawki.
  // Użytkownik zamyka je istniejącym przyciskiem przed pracą w panelu.
  const menu = page.locator('[data-vilda-chrome-drawer]');
  if (await menu.getAttribute('aria-hidden') === 'false') {
    await menu.locator('button[data-vilda-chrome-drawer-close]').click();
    await expect(menu).not.toBeVisible();
  }
}

async function sprawdzWskazanie(lab) {
  await expect(lab.locator('#labClinicalIndication'),
    'cel odnośnika z baneru wybiera otyłość dziecięcą').toHaveValue('obesity_kids');
  await expect(lab.locator('#labSuggestResults')).toBeVisible();
  await expect(lab.locator('#labSuggestResultsTitle')).toContainText('Otyłość u dzieci i młodzieży');
}

async function przygotujCieplyLab(page) {
  await zwyklaNawigacja(page, 'przelicznik-jednostek.html');
  const lab = await ramka(page, 'Jednostki laboratoryjne');
  await lab.locator('#labClinicalIndication').selectOption('adrenal_insufficiency');
  await expect(lab.locator('#labSuggestResults')).toBeVisible();
  await lab.locator('#labSubstance').fill('Kortyzol');
  await lab.locator('.lab-substance-option[data-id="cortisol"]').click();
  await lab.locator('#labValue').fill('123');
  await lab.locator('#labValue').blur();
  await lab.evaluate(() => { window.__e2eLabDocument = 'cieply-panel-lab'; });
  return lab;
}

async function sprawdzCieplyFormularz(lab) {
  await expect(lab.locator('#labSubstance')).toHaveValue('Kortyzol');
  await expect(lab.locator('#labValue')).toHaveValue('123');
  expect(await lab.evaluate(() => window.__e2eLabDocument),
    'nawigacja zachowuje dokument ciepłej ramki, bez przeładowania').toBe('cieply-panel-lab');
}

test('standalone: baner Cole otwiera właściwe wskazanie laboratoryjne', async ({ page }) => {
  await fikcyjneKonto(page);
  const link = await banerCole(page);
  await link.click();
  await expect(page).toHaveURL(/\/przelicznik-jednostek\.html\?wskazanie=obesity_kids$/);
  await sprawdzWskazanie(page);
});

test('powłoka: baner Cole przekazuje wskazanie przy pierwszym otwarciu panelu lab', async ({ page }) => {
  let zwolnijLab;
  let rozpoczetOdczytLab = false;
  const oczekujNaKlik = new Promise((resolve) => { zwolnijLab = resolve; });
  await page.route('**/przelicznik-jednostek.html*', async (route) => {
    rozpoczetOdczytLab = true;
    await oczekujNaKlik;
    await route.continue();
  });
  try {
    const start = await otworzPowloke(page, 'domcontentloaded');
    const link = await banerCole(start);
    await expect.poll(() => rozpoczetOdczytLab,
      { message: 'dokument lab jest nadal w trakcie pobierania w chwili kliknięcia baneru' }).toBe(true);
    await expect(page.locator('iframe.app-pane[title="Jednostki laboratoryjne"]')).not.toBeVisible();
    await link.click();
  } finally { zwolnijLab(); }
  await expect(page).toHaveURL(/\/app\.html#\/lab(?:\?|$)/);
  await sprawdzWskazanie(await ramka(page, 'Jednostki laboratoryjne'));
});

test('powłoka: baner zmienia wcześniejsze wskazanie w ciepłym lab i zachowuje jego formularz', async ({ page }) => {
  const start = await otworzPowloke(page);
  const link = await banerCole(start);
  const lab = await przygotujCieplyLab(page);
  await zwyklaNawigacja(page, 'index.html');
  await expect(page).toHaveURL(/\/app\.html#\/start$/);
  await link.click();
  await expect(page).toHaveURL(/\/app\.html#\/lab(?:\?|$)/);
  await sprawdzWskazanie(lab);
  await sprawdzCieplyFormularz(lab);
});

test('powłoka: zwykłe menu zachowuje wskazanie i formularz ciepłego lab', async ({ page }) => {
  await otworzPowloke(page);
  const lab = await przygotujCieplyLab(page);
  await zwyklaNawigacja(page, 'index.html');
  await zwyklaNawigacja(page, 'przelicznik-jednostek.html');
  await expect(lab.locator('#labClinicalIndication')).toHaveValue('adrenal_insufficiency');
  await expect(lab.locator('#labSuggestResultsTitle')).toContainText('Niedoczynność kory nadnerczy');
  await sprawdzCieplyFormularz(lab);
});

test('powłoka: Forward ponawia wskazanie z baneru, a F5 zachowuje jego cel', async ({ page }) => {
  const start = await otworzPowloke(page);
  const link = await banerCole(start);
  const lab = await przygotujCieplyLab(page);
  await zwyklaNawigacja(page, 'index.html');
  await link.click();
  await ramka(page, 'Jednostki laboratoryjne');
  // Zmiana przez użytkownika odróżnia ponowne dostarczenie wpisu historii
  // od przypadkowego zachowania wartości ustawionej pierwszym kliknięciem.
  await lab.locator('#labClinicalIndication').selectOption('adrenal_insufficiency');
  await page.goBack();
  await expect(page).toHaveURL(/\/app\.html#\/start$/);
  await page.goForward();
  await expect(page).toHaveURL(/\/app\.html#\/lab(?:\?|$)/);
  await sprawdzWskazanie(lab);
  await sprawdzCieplyFormularz(lab);
  await page.reload({ waitUntil: 'load' });
  await sprawdzWskazanie(await ramka(page, 'Jednostki laboratoryjne'));
});
