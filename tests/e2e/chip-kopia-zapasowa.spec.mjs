import { devices } from '@playwright/test';
import { expect, test } from '../support/test-czas.mjs';

// Rzeczywisty auto-mechanizm K→I→N uruchamiamy jawnie przez force po otwarciu
// popupu. To test kolejności zdarzeń, nie test czasu schedulera auto-backupu.
// Eksporter, pobranie i popup pozostają produkcyjne; wyłącznie dane fikcyjne.
test.use({ serviceWorkers: 'block' });

const PACJENT = {
  lastName: 'Fikcyjny', firstName: 'Kopia', sex: 'M',
  age: 10, ageMonths: 3, height: 141, weight: 34,
};

async function odrzucCookies(ctx) {
  const przycisk = ctx.locator('#consent-decline');
  if (await przycisk.isVisible()) await przycisk.click();
}

async function gotowyFormularz(ctx) {
  await ctx.waitForFunction(() => window.VildaVault?.isUnlocked()
    && typeof window.collectUserData === 'function'
    && Boolean(window.VildaFileExport)
    && !document.documentElement.classList.contains('vilda-auth-locked'));
  await odrzucCookies(ctx);
}

async function fikcyjneKonto(page) {
  await page.addInitScript(() => {
    localStorage.setItem('vilda-terms-accepted-v1',
      JSON.stringify({ version: 1, acceptedAtISO: new Date().toISOString() }));
  });
  await page.goto('/index.html', { waitUntil: 'load' });
  await page.waitForFunction(() => Boolean(window.VildaVault));
  await page.evaluate(() => window.VildaVault.createUser('E2e#KopiaChipu!26',
    { label: 'Fikcyjne konto E2E kopii zapasowej', iterations: 10000 }));
  await page.reload({ waitUntil: 'load' });
  await gotowyFormularz(page);
}

async function zapiszPacjenta(page) {
  for (const [id, value] of Object.entries(PACJENT)) {
    if (id === 'sex') await page.locator(`#${id}`).selectOption(value);
    else await page.locator(`#${id}`).fill(String(value));
  }
  await page.locator('#weight').blur();
  const zapisz = page.locator('#saveDataBtnSidebar');
  if (await zapisz.isVisible()) await zapisz.click();
  else {
    await page.locator('[data-vilda-chrome-menu-btn]').click();
    await page.locator('[data-vilda-chrome-drawer] [data-drawer-btn="saveDataBtnSidebar"]').click();
    await expect(page.locator('[data-vilda-chrome-drawer]')).not.toBeVisible();
  }
  let id;
  await expect.poll(async () => {
    id = await page.evaluate(async () => {
      const pacjenci = await window.VildaVault.listPatients();
      return pacjenci.find((p) => p.header?.name === 'Fikcyjny Kopia')?.patientId || null;
    });
    return id;
  }, { message: 'zapis fikcyjnego pacjenta przez rzeczywisty formularz' }).toBeTruthy();
  await expect.poll(() => page.evaluate(() => sessionStorage.getItem('vildaCurrentPatientId'))).toBe(id);
  return id;
}

async function ramka(page, tytul) {
  const iframe = page.locator(`iframe.app-pane[title="${tytul}"]`);
  await expect(iframe).toBeVisible();
  const frame = await (await iframe.elementHandle()).contentFrame();
  await frame.waitForLoadState('load');
  await gotowyFormularz(frame);
  return frame;
}

async function przygotuj(page, kontekst) {
  await fikcyjneKonto(page);
  const id = await zapiszPacjenta(page);
  let eksporter = page;
  if (kontekst === 'DocPro') {
    await page.goto('/docpro.html', { waitUntil: 'load' });
    await gotowyFormularz(page);
  } else if (kontekst === 'powłoka') {
    await page.goto('/app.html#/docpro', { waitUntil: 'load' });
    await odrzucCookies(page);
    eksporter = await ramka(page, 'DocPro');
    // Host nie ładuje VildaFileExport. Backup odbywa się w prawdziwej ramce;
    // jego click nie bąbelkuje do hosta. Ten przypadek jest kontrolą integracji.
    expect(await page.evaluate(() => typeof window.VildaFileExport)).toBe('undefined');
  }
  await expect.poll(() => eksporter.evaluate(() => sessionStorage.getItem('vildaCurrentPatientId'))).toBe(id);
  await expect(page.locator('#vildaPatientChip')).toContainText('Fikcyjny Kopia');
  return eksporter;
}

async function otworzPopup(page) {
  await page.locator('#vildaPatientChip').click();
  const popup = page.locator('.vilda-save-popover');
  await expect(popup).toBeVisible();
  await expect(popup).toHaveClass(/\bis-visible\b/);
  await expect(page.locator('[data-vilda-open-card]')).toBeVisible();
  await expect(page.locator('#vildaPatientChip')).toHaveAttribute('aria-expanded', 'true');
  return popup;
}

async function wykonajPrawdziwaKopie(page, eksporter) {
  // Bierna obserwacja rzeczywistego zdarzenia; nie zatrzymujemy go ani nie
  // zastępujemy linku, jego click, szyfrowania czy eksportera.
  await eksporter.evaluate(() => {
    window.__e2eKopiaChipuClicks = [];
    document.addEventListener('click', (event) => {
      const a = event.target?.closest?.('a[download]');
      if (a) window.__e2eKopiaChipuClicks.push({
        isTrusted: event.isTrusted,
        protocol: new URL(a.href, location.href).protocol,
        filename: a.download,
      });
    }, true);
  });
  const pobranie = page.waitForEvent('download');
  const wynik = await eksporter.evaluate(() => window.VildaFileExport.tryAutoVaultBackup({ force: true }));
  const download = await pobranie;
  expect(wynik.skipped, 'auto-mechanizm rzeczywiście wykonał kopię').toBe(false);
  expect(wynik.method).toBe('download');
  expect(download.suggestedFilename()).toBe(wynik.filename);
  expect(wynik.filename).toMatch(/^wagaiwzrost_konto_Fikcyjne_.*\.wiw$/);
  expect(await download.failure(), 'rzeczywiste pobranie kopii zakończyło się poprawnie').toBeNull();
  expect(await eksporter.evaluate(() => window.__e2eKopiaChipuClicks),
    'produkcyjny eksporter wykonał programowy click linku blob').toEqual(expect.arrayContaining([
    { isTrusted: false, protocol: 'blob:', filename: wynik.filename },
  ]));
}

async function sprawdzKarte(page, kontekst) {
  let ctx = page;
  if (kontekst === 'powłoka') {
    await expect(page).toHaveURL(/\/app\.html#\/start$/);
    ctx = await ramka(page, 'Start');
  }
  const karta = ctx.locator('.vilda-auth-patient-card');
  await expect(karta).toBeVisible();
  await expect(karta.locator('.vilda-patient-hero-name')).toHaveText('Fikcyjny Kopia');
  await expect(karta.locator('.vilda-patient-stat').filter({ hasText: 'Wzrost' })).toContainText('141,0 cm');
  await expect(karta.locator('.vilda-patient-stat').filter({ hasText: 'Waga' })).toContainText('34,0 kg');
  const szerokosc = await ctx.evaluate(() => ({ strona: document.documentElement.scrollWidth, ekran: innerWidth }));
  expect(szerokosc.strona).toBeLessThanOrEqual(szerokosc.ekran + 1);
}

for (const platforma of ['desktop', 'mobile']) {
  test.describe(platforma, () => {
    if (platforma === 'mobile') {
      const d = devices['iPhone 15 Pro'];
      test.use({ viewport: d.viewport, userAgent: d.userAgent, deviceScaleFactor: d.deviceScaleFactor,
        isMobile: d.isMobile, hasTouch: d.hasTouch });
    }

    for (const kontekst of ['Start', 'DocPro', 'powłoka']) {
      test(`${kontekst}: prawdziwa kopia nie zamyka popupu, a klik otwiera kartę`, async ({ page }) => {
        const eksporter = await przygotuj(page, kontekst);
        const popup = await otworzPopup(page);
        await wykonajPrawdziwaKopie(page, eksporter);
        // RED ma wskazać utracony popup po udanym download, zanim zaczniemy
        // oczekiwać na klik niewidocznego przycisku.
        await expect(popup, 'programowy click rzeczywistego backupu pozostawia popup otwarty')
          .toHaveClass(/\bis-visible\b/);
        await expect(page.locator('#vildaPatientChip')).toHaveAttribute('aria-expanded', 'true');
        await page.locator('[data-vilda-open-card]').click();
        await expect(popup).not.toBeVisible();
        await sprawdzKarte(page, kontekst);
        if (kontekst !== 'powłoka') await expect(page).toHaveURL(kontekst === 'Start'
          ? /\/index\.html$/ : /\/docpro\.html$/);
      });
    }

    test('kontrola: prawdziwy klik poza popupem i Escape nadal zamykają', async ({ page }) => {
      await przygotuj(page, 'Start');
      let popup = await otworzPopup(page);
      await page.locator('#height').click();
      await expect(popup).not.toBeVisible();
      await expect(page.locator('#vildaPatientChip')).toHaveAttribute('aria-expanded', 'false');
      popup = await otworzPopup(page);
      await page.keyboard.press('Escape');
      await expect(popup).not.toBeVisible();
      await expect(page.locator('#vildaPatientChip')).toHaveAttribute('aria-expanded', 'false');
      await otworzPopup(page);
      await page.locator('[data-vilda-open-card]').click();
      await sprawdzKarte(page, 'Start');
    });
  });
}
