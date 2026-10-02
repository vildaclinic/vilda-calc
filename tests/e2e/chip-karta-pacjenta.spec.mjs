import { expect, test } from '../support/test-czas.mjs';

// P-CHIP-KARTA: wejście w kartę bez wcześniejszego otwierania listy pacjentów.
// Wpisy i zapis przechodzą przez prawdziwy formularz, a kartę otwiera wyłącznie
// kliknięcie chipu oraz jego akcji. Dane i konto są wyłącznie fikcyjne.
test.use({ serviceWorkers: 'block' });

const HASLO = 'E2e#ChipKartaPacjenta!26';
const PIERWSZY = {
  lastName: 'Fikcyjny', firstName: 'Chipowy', sex: 'M',
  age: 10, ageMonths: 3, height: 141, weight: 34,
};
const DRUGI = {
  lastName: 'Fikcyjna', firstName: 'Druga', sex: 'F',
  age: 12, ageMonths: 1, height: 153, weight: 42,
};

async function gotowyFormularz(ctx) {
  await ctx.waitForFunction(() => Boolean(window.VildaVault) && window.VildaVault.isUnlocked()
    && typeof window.collectUserData === 'function');
  await ctx.waitForFunction(() => !document.documentElement.classList.contains('vilda-auth-locked'));
}

async function otworzKonto(page) {
  await page.addInitScript(() => {
    window.localStorage.setItem('vilda-terms-accepted-v1',
      JSON.stringify({ version: 1, acceptedAtISO: new Date().toISOString() }));
  });
  await page.goto('/index.html', { waitUntil: 'load' });
  await page.waitForFunction(() => Boolean(window.VildaVault));
  await page.evaluate(async (pw) => window.VildaVault.createUser(pw,
    { label: 'Fikcyjne konto E2E chipu pacjenta', iterations: 10000 }), HASLO);
  await page.reload({ waitUntil: 'load' });
  await gotowyFormularz(page);
}

async function kliknijZapisz(page) {
  const zapisz = page.locator('#saveDataBtnSidebar');
  if (await zapisz.isVisible()) { await zapisz.click(); return; }
  await page.locator('[data-vilda-chrome-menu-btn]').click();
  const wMenu = page.locator('[data-vilda-chrome-drawer] [data-drawer-btn="saveDataBtnSidebar"]');
  await expect(wMenu).toBeVisible();
  await wMenu.click();
}

async function wpiszIZapisz(page, dane = PIERWSZY) {
  for (const [id, value] of Object.entries(dane)) {
    const pole = page.locator(`#${id}`);
    if (id === 'sex') await pole.selectOption(value);
    else await pole.fill(String(value));
  }
  await page.locator('#weight').blur();
  await kliknijZapisz(page);
  let id;
  await expect.poll(async () => {
    id = await page.evaluate(async (nazwisko) => {
      const patients = await window.VildaVault.listPatients();
      const patient = patients.find((p) => p.header?.name === nazwisko);
      return patient?.patientId || null;
    }, `${dane.lastName} ${dane.firstName}`);
    return id;
  }, { message: 'rzeczywisty zapis nowego fikcyjnego pacjenta w sejfie' }).toBeTruthy();
  await expect.poll(() => page.evaluate(() => window.sessionStorage.getItem('vildaCurrentPatientId')))
    .toBe(id);
  return id;
}

async function otworzPrzezChip(page) {
  await sprawdzSzerokosc(page);
  await page.locator('#vildaPatientChip').click();
  const akcja = page.locator('[data-vilda-open-card]');
  await expect(akcja, 'chip udostępnia akcję dla zapisanego pacjenta').toBeVisible();
  await sprawdzSzerokosc(page);
  await akcja.click();
  await expect(page.locator('.vilda-save-popover')).not.toBeVisible();
}

async function sprawdzSzerokosc(ctx) {
  const szerokosc = await ctx.evaluate(() => ({
    strona: document.documentElement.scrollWidth,
    ekran: window.innerWidth,
  }));
  expect(szerokosc.strona, 'strona, popover i karta mieszczą się bez przewijania poziomego')
    .toBeLessThanOrEqual(szerokosc.ekran + 1);
}

async function sprawdzKarte(ctx, dane = PIERWSZY) {
  const karta = ctx.locator('.vilda-auth-patient-card');
  await expect(karta, 'klik z chipu otworzył rzeczywistą kartę pacjenta').toBeVisible();
  await expect(karta.locator('.vilda-patient-hero-name')).toHaveText(`${dane.lastName} ${dane.firstName}`);
  await expect(karta.locator('.vilda-patient-stat').filter({ hasText: 'Wzrost' }))
    .toContainText(`${dane.height},0 cm`);
  await expect(karta.locator('.vilda-patient-stat').filter({ hasText: 'Waga' }))
    .toContainText(`${dane.weight},0 kg`);
  await sprawdzSzerokosc(ctx);
}

test('index: po wpisaniu i zapisie nowego pacjenta chip otwiera jego kartę bez wizyty na liście', async ({ page }) => {
  await otworzKonto(page);
  await wpiszIZapisz(page);
  await expect(page.locator('.vilda-auth-patient-card')).toHaveCount(0);
  await otworzPrzezChip(page);
  await sprawdzKarte(page);
  await expect(page).toHaveURL(/\/index\.html$/);
});

test('DocPro: chip po zapisie na index i przejściu otwiera kartę bieżącego pacjenta', async ({ page }) => {
  await otworzKonto(page);
  const id = await wpiszIZapisz(page);
  await page.goto('/docpro.html', { waitUntil: 'load' });
  await gotowyFormularz(page);
  await expect.poll(() => page.evaluate(() => window.sessionStorage.getItem('vildaCurrentPatientId')))
    .toBe(id);
  await expect(page.locator('.vilda-auth-patient-card')).toHaveCount(0);
  await otworzPrzezChip(page);
  await sprawdzKarte(page);
  await expect(page).toHaveURL(/\/docpro\.html$/);
});

test('app.html: działająca ścieżka chipu powłoki nadal otwiera kartę w ramce Start', async ({ page }) => {
  await otworzKonto(page);
  await wpiszIZapisz(page);
  await page.goto('/app.html#/start', { waitUntil: 'load' });
  await expect(page.locator('iframe.app-pane[title="Start"]')).toBeVisible();
  const uchwyt = await page.locator('iframe.app-pane[title="Start"]').elementHandle();
  const start = await uchwyt.contentFrame();
  await gotowyFormularz(start);
  await expect(start.locator('.vilda-auth-patient-card')).toHaveCount(0);
  await otworzPrzezChip(page);
  await sprawdzKarte(start);
  await expect(page).toHaveURL(/\/app\.html#\/start$/);
});

test('zmiana pacjenta: po wyczyszczeniu i zapisie drugiego chip otwiera drugiego, nie wcześniejszego', async ({ page }) => {
  await otworzKonto(page);
  const pierwszyId = await wpiszIZapisz(page);
  await page.locator('#clearAllDataBtn').click();
  await expect.poll(() => page.evaluate(() => window.VildaPersistence.isClearInProgress())).toBe(false);
  await expect(page.locator('#lastName')).toHaveValue('');
  const drugiId = await wpiszIZapisz(page, DRUGI);
  expect(drugiId).not.toBe(pierwszyId);
  await otworzPrzezChip(page);
  await sprawdzKarte(page, DRUGI);
  await expect(page.locator('.vilda-patient-hero-name')).not.toContainText(PIERWSZY.firstName);
});

test('app.html z DocPro: chip otwiera kartę na Start, a przycisk powrotu przywraca DocPro', async ({ page }) => {
  await otworzKonto(page);
  const id = await wpiszIZapisz(page);
  await page.goto('/app.html#/docpro', { waitUntil: 'load' });
  await expect(page.locator('iframe.app-pane[title="DocPro"]')).toBeVisible();
  const uchwytDocPro = await page.locator('iframe.app-pane[title="DocPro"]').elementHandle();
  const docpro = await uchwytDocPro.contentFrame();
  await gotowyFormularz(docpro);
  await otworzPrzezChip(page);
  await expect(page).toHaveURL(/\/app\.html#\/start$/);
  const uchwytStart = await page.locator('iframe.app-pane[title="Start"]').elementHandle();
  const start = await uchwytStart.contentFrame();
  await sprawdzKarte(start);
  await start.getByRole('button', { name: '← DocPro', exact: true }).click();
  await expect(page).toHaveURL(/\/app\.html#\/docpro$/);
  await expect(page.locator('iframe.app-pane[title="DocPro"]')).toBeVisible();
  await expect(start.locator('.vilda-auth-patient-card')).not.toBeVisible();
  await expect.poll(() => docpro.evaluate(() => window.sessionStorage.getItem('vildaCurrentPatientId')))
    .toBe(id);
  await expect(docpro.locator('#lastName')).toHaveValue(PIERWSZY.lastName);
  await expect(docpro.locator('#height')).toHaveValue(String(PIERWSZY.height));
  await sprawdzSzerokosc(page);
});
