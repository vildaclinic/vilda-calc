import { expect, test } from '../support/test-czas.mjs';
import { openPatientDocuments, DOCUMENTS_BUTTON, DOCUMENTS_DIALOG, DOCUMENTS_COPY } from '../support/patient-documents-ui.mjs';

// Regresja pierwszego kliknięcia po edycji formularza: mousedown → blur
// przelicza podsumowanie. Nowe wejście „Dokumenty pacjenta” ma przeżyć ten cykl
// jako ten sam węzeł i otworzyć panel bez drugiego kliknięcia.
test.use({ serviceWorkers: 'block' });

const HASLO = 'E2e#AkcjeKlik!26aa';

async function otworzPro(page) {
  await page.addInitScript(() => {
    try {
      window.localStorage.setItem(
        'vilda-terms-accepted-v1',
        JSON.stringify({ version: 1, acceptedAtISO: new Date().toISOString() }),
      );
    } catch (_) { /* brak storage — pomiń */ }
    // Schowek pod kontrolą testu, żeby „Kopiuj opis" nie zależał od uprawnień przeglądarki.
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: (t) => { window.__schowek = t; return Promise.resolve(); } },
      configurable: true,
    });
  });
  await page.goto('/index.html', { waitUntil: 'load' });
  await page.waitForFunction(() => Boolean(window.VildaVault));
  await page.evaluate(
    async (pw) => window.VildaVault.createUser(pw, { label: 'e2e', iterations: 10000 }),
    HASLO,
  );
  await page.reload({ waitUntil: 'load' });
  await page.waitForFunction(() => Boolean(window.VildaVault) && window.VildaVault.isUnlocked());
  await page.waitForFunction(() => !document.documentElement.classList.contains('vilda-auth-locked'));
  await page.waitForFunction(() => Boolean(window.VildaPatientNarrativeUI));

  if (await page.locator('#sex').isEnabled()) await page.selectOption('#sex', 'M');
  await page.fill('#age', '7');
  await page.fill('#ageMonths', '0');
  await page.fill('#height', '117');
  // Karta podsumowania pojawia się dopiero przy komplecie danych — bez masy nie ma
  // przycisków, więc wypełniamy ją tu, a poprawiamy dopiero w pomiarze.
  await page.fill('#weight', '20');
  await page.evaluate(() => {
    const pro = document.getElementById('resultsModeToggle');
    if (pro && !pro.checked) { pro.checked = true; pro.dispatchEvent(new Event('change', { bubbles: true })); }
  });
}

// Sedno pomiaru: korygujemy masę i NIE ruszamy fokusu — kursor zostaje w polu, tak jak
// u lekarza, który poprawił wagę i zaraz sięga myszą do przycisku.
async function popawMaseIZostawFokus(page) {
  await page.fill('#weight', '20.5');
  await expect.poll(() => page.evaluate(
    () => document.activeElement && document.activeElement.id,
  )).toBe('weight');
}

const menuBtn = (page) => page.locator(DOCUMENTS_BUTTON);
const modal = (page) => page.locator(DOCUMENTS_DIALOG);

test.describe('Dokumenty pacjenta — pierwsze kliknięcie po wpisaniu wartości', () => {
  test('menu reaguje na PIERWSZE kliknięcie i udostępnia wybór raportu', async ({ page }) => {
    await otworzPro(page);
    await expect(menuBtn(page)).toBeVisible({ timeout: 20000 });
    await popawMaseIZostawFokus(page);

    await menuBtn(page).click();
    await expect(modal(page), 'jedno kliknięcie ma otworzyć Dokumenty pacjenta').toBeVisible({ timeout: 10000 });
    await expect(modal(page).locator('input[name="patientReportPdfChoice"][value="visit"]')).toBeChecked();
  });

  test('kontrola pozytywna: kliknięcie bez fokusu w polu działa jak dotąd', async ({ page }) => {
    await otworzPro(page);
    await expect(menuBtn(page)).toBeVisible({ timeout: 20000 });
    await popawMaseIZostawFokus(page);
    await page.evaluate(() => document.activeElement && document.activeElement.blur());

    await menuBtn(page).click();
    await expect(modal(page)).toBeVisible({ timeout: 10000 });
  });

  test('pierwsze kliknięcie udostępnia opis wraz z przyczyną braku historii', async ({ page }) => {
    await otworzPro(page);
    await expect(menuBtn(page)).toBeVisible({ timeout: 20000 });
    await popawMaseIZostawFokus(page);

    await openPatientDocuments(page);
    await expect(page.locator(DOCUMENTS_COPY)).toBeVisible();
    await expect(page.locator(DOCUMENTS_COPY)).toBeDisabled();
    await expect(modal(page).locator('[data-patient-documents-copy-reason]')).toContainText('co najmniej dwóch pomiarów');
    expect(await page.evaluate(() => window.__schowek)).toBeUndefined();
  });

  test('wejście w menu nie jest przebudowywane przy każdym przeliczeniu karty', async ({ page }) => {
    await otworzPro(page);
    await expect(menuBtn(page)).toBeVisible({ timeout: 20000 });

    await menuBtn(page).evaluate(button => { button.dataset.znacznikTestu = 'przed'; });
    await page.fill('#weight', '20.7');
    await page.locator('#weight').blur();
    await page.fill('#weight', '21');
    await page.locator('#weight').blur();

    await expect(menuBtn(page), 'jedno wejście desktopowe, nie duplikaty').toHaveCount(1);
    await expect(menuBtn(page), 'przycisk przeżywa przeliczenie jako ten sam węzeł').toHaveAttribute('data-znacznik-testu', 'przed');
    await expect(page.locator('.current-summary-actions'), 'stopka nie odrasta po przeliczeniu').toHaveCount(0);
    await openPatientDocuments(page);
    await expect(page.locator(DOCUMENTS_DIALOG)).toHaveCount(1);
  });
});
