import { expect, test } from '../support/test-czas.mjs';

// Punkt 8: prawdziwe kliknięcia przeglądarki, bez zastępowania routingu.
// Konto i dane są fikcyjne; każdy przypadek korzysta z nowego kontekstu.
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
  await page.evaluate(() => window.VildaVault.createUser('E2e#NoweKarty!26',
    { label: 'Fikcyjne konto testu nowych kart', iterations: 10000 }));
  await page.reload({ waitUntil: 'load' });
  await gotowyStart(page);
  await odrzucCookies(page);
}

async function gotowyStart(ctx) {
  await ctx.waitForFunction(() => window.VildaVault?.isUnlocked()
    && typeof window.collectUserData === 'function'
    && Boolean(window.VildaChrome)
    && !document.documentElement.classList.contains('vilda-auth-locked'));
}

async function ramka(page, tytul) {
  const iframe = page.locator(`iframe.app-pane[title="${tytul}"]`);
  await expect(iframe).toBeVisible();
  const frame = await (await iframe.elementHandle()).contentFrame();
  await frame.waitForLoadState('load');
  await frame.waitForFunction(() => Boolean(window.VildaChrome));
  await odrzucCookies(frame);
  return frame;
}

async function wypelnijHoma(ctx) {
  await ctx.locator('#glucoseUnit').selectOption('mg');
  await ctx.locator('#glucose').fill('90');
  await ctx.locator('#insulin').fill('12');
  await ctx.locator('#insulin').blur();
  await expect(ctx.locator('#wynik')).toContainText('Twój wskaźnik HOMA');
  await ctx.evaluate(() => { window.__e2eNoweKartyDocument = 'roboczy-homa'; });
  return ctx.locator('#wynik').innerText();
}

async function cieplaPowloka(page) {
  await fikcyjneKonto(page);
  await page.goto('/app.html#/start', { waitUntil: 'load' });
  await odrzucCookies(page);
  const start = await ramka(page, 'Start');
  await gotowyStart(start);
  await page.locator('.sidebar-nav a[href="homa-ir.html"]').click();
  const homa = await ramka(page, 'HOMA-IR');
  const wynik = await wypelnijHoma(homa);
  await page.locator('.sidebar-nav a[href="index.html"]').click();
  await expect(page).toHaveURL(/\/app\.html#\/start$/);
  await expect(page.locator('iframe.app-pane[title="Start"]')).toBeVisible();
  return { start, homa, wynik };
}

async function banerCole(start) {
  for (const [id, value] of Object.entries({
    lastName: 'Fikcyjny', firstName: 'Odnosnik',
    age: '12', ageMonths: '0', height: '150', weight: '90',
  })) await start.locator(`#${id}`).fill(value);
  await start.locator('#sex').selectOption('M');
  await start.locator('#weight').blur();
  const link = start.locator('#coleObesityKidsBanner a');
  await expect(link).toBeVisible();
  await expect(link).toHaveAttribute('href', 'przelicznik-jednostek.html?wskazanie=obesity_kids');
  return link;
}

async function stanDokumentu(page) {
  return page.evaluate(() => ({ url: location.href, historia: history.length }));
}

async function sprawdzHoma(ctx, wynik) {
  expect.soft(await ctx.evaluate(() => window.__e2eNoweKartyDocument),
    'kliknięcie zachowuje dokument z roboczym formularzem HOMA').toBe('roboczy-homa');
  await expect.soft(ctx.locator('#glucose')).toHaveValue('90');
  await expect.soft(ctx.locator('#glucoseUnit')).toHaveValue('mg');
  await expect.soft(ctx.locator('#insulin')).toHaveValue('12');
  await expect.soft(ctx.locator('#wynik')).toHaveText(wynik);
}

const sposoby = [
  { nazwa: 'Ctrl+klik', opcje: { modifiers: ['Control'] } },
  { nazwa: 'środkowy przycisk', opcje: { button: 'middle' } },
  { nazwa: 'target=_blank', opcje: {}, blank: true },
];

async function otworzNowaKarte(context, link, sposob) {
  // Zmieniamy tylko standardowy atrybut istniejącego odnośnika.
  // Obsługa kliknięcia i otwarcie karty pozostają produkcyjne/natywne.
  if (sposob.blank) await link.evaluate((a) => { a.target = '_blank'; });
  const href = await link.evaluate((a) => a.href);
  const nowaKarta = context.waitForEvent('page', { timeout: 10_000 }).catch(() => null);
  await link.click(sposob.opcje);
  return { popup: await nowaKarta, href };
}

async function sprawdzNowaKarte(popup, href, kliniczne = false) {
  expect(popup, 'przeglądarka otwiera nową kartę dla pełnego href').not.toBeNull();
  try {
    await expect(popup).toHaveURL(href);
    await popup.waitForLoadState('load');
    if (kliniczne) {
      await expect(popup.locator('#labClinicalIndication')).toHaveValue('obesity_kids');
      await expect(popup.locator('#labSuggestResultsTitle')).toContainText('Otyłość u dzieci i młodzieży');
    }
  } finally {
    await popup.close();
  }
}

for (const sposob of sposoby) {
  test(`host: ${sposob.nazwa} otwiera nową kartę i zachowuje powłokę oraz HOMA`, async ({ page, context }) => {
    const { homa, wynik } = await cieplaPowloka(page);
    const przed = await stanDokumentu(page);
    const { popup, href } = await otworzNowaKarte(context,
      page.locator('.sidebar-nav a[href="homa-ir.html"]'), sposob);
    expect.soft(await stanDokumentu(page), 'adres i długość historii starej karty pozostają bez zmian').toEqual(przed);
    await expect.soft(page.locator('iframe.app-pane[title="Start"]')).toBeVisible();
    await expect.soft(page.locator('iframe.app-pane[title="HOMA-IR"]')).not.toBeVisible();
    await sprawdzHoma(homa, wynik);
    await sprawdzNowaKarte(popup, href);
  });

  test(`iframe: ${sposob.nazwa} zachowuje wskazanie kliniczne w nowej karcie i roboczą HOMA`, async ({ page, context }) => {
    const { start, homa, wynik } = await cieplaPowloka(page);
    const link = await banerCole(start);
    const przed = await stanDokumentu(page);
    const { popup, href } = await otworzNowaKarte(context, link, sposob);
    expect.soft(await stanDokumentu(page), 'odnośnik w ramce nie zmienia historii ani adresu hosta').toEqual(przed);
    await expect.soft(page.locator('iframe.app-pane[title="Start"]')).toBeVisible();
    await expect.soft(start.locator('#firstName')).toHaveValue('Odnosnik');
    await sprawdzHoma(homa, wynik);
    await sprawdzNowaKarte(popup, href, true);
  });

  test(`standalone: ${sposob.nazwa} zachowuje samodzielny formularz HOMA`, async ({ page, context }) => {
    await fikcyjneKonto(page);
    await page.goto('/homa-ir.html', { waitUntil: 'load' });
    await page.waitForFunction(() => Boolean(window.VildaChrome));
    await odrzucCookies(page);
    const wynik = await wypelnijHoma(page);
    const przed = await stanDokumentu(page);
    const { popup, href } = await otworzNowaKarte(context,
      page.locator('.sidebar-nav a[href="przelicznik-jednostek.html"]'), sposob);
    expect.soft(await stanDokumentu(page), 'stara karta pozostaje na stronie samodzielnej bez dodatkowej historii').toEqual(przed);
    await sprawdzHoma(page, wynik);
    await sprawdzNowaKarte(popup, href);
  });
}
