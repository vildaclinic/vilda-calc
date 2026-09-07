import { expect, test } from '../support/test-czas.mjs';

// Przyciski akcji w karcie „Podsumowanie wyników" — „Raport PDF dla pacjenta"
// i „Kopiuj opis pacjenta" — gubiły PIERWSZE kliknięcie wykonane zaraz po wpisaniu
// wartości do formularza.
//
// Mechanizm: `mousedown` odbiera fokus polu (masa/wzrost/wiek) → `blur` przelicza kartę
// → `attachPatientReportActionToSummaryCard` kasowało wrapper `.current-summary-actions`
// i budowało nowy → `mouseup` trafiał w INNY węzeł niż `mousedown`, więc przeglądarka
// nie składała zdarzenia `click`. Dla lekarza wyglądało to jak martwy przycisk: klik,
// i nic. Drugie kliknięcie działało, bo wtedy fokus był już zdjęty.
//
// Ten plik mierzy zachowanie na prawdziwej stronie, w układzie, w którym błąd występuje:
// wartość wpisana w pole, kursor nadal w polu, jedno kliknięcie w przycisk.
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

const pdfBtn = (page) => page.locator('.current-summary-actions [data-patient-report-pdf-btn]');
const opisBtn = (page) => page.locator('.current-summary-actions [data-patient-narrative-copy-btn]');
const modal = (page) => page.locator('#patientReportPdfChoiceBackdrop');

test.describe('Karta podsumowania — pierwsze kliknięcie po wpisaniu wartości', () => {
  test('„Raport PDF dla pacjenta" reaguje na PIERWSZE kliknięcie', async ({ page }) => {
    await otworzPro(page);
    await expect(pdfBtn(page)).toBeVisible({ timeout: 20000 });
    await popawMaseIZostawFokus(page);

    await pdfBtn(page).click();
    await expect(modal(page), 'jedno kliknięcie ma otworzyć wybór raportu').toBeVisible({ timeout: 10000 });
  });

  test('kontrola pozytywna: kliknięcie bez fokusu w polu działa jak dotąd', async ({ page }) => {
    await otworzPro(page);
    await expect(pdfBtn(page)).toBeVisible({ timeout: 20000 });
    await popawMaseIZostawFokus(page);
    // Zdjęcie fokusu przed kliknięciem to ścieżka, która działała także przed naprawą —
    // pilnuje, żeby poprawka niczego w niej nie zepsuła.
    await page.evaluate(() => document.activeElement && document.activeElement.blur());

    await pdfBtn(page).click();
    await expect(modal(page)).toBeVisible({ timeout: 10000 });
  });

  test('„Kopiuj opis pacjenta" też reaguje na pierwsze kliknięcie', async ({ page }) => {
    await otworzPro(page);
    await expect(opisBtn(page)).toBeVisible({ timeout: 20000 });
    await popawMaseIZostawFokus(page);

    await opisBtn(page).click();
    // Bez historii pomiarów opis nie powstanie — liczy się to, że KLIKNIĘCIE DOSZŁO,
    // czyli że pojawia się jakikolwiek komunikat z obsługi przycisku.
    await expect(page.locator('#patientReportPdfToast, #patientNarrativeToast'))
      .toBeVisible({ timeout: 10000 });
  });

  test('wrapper akcji nie jest przebudowywany przy każdym przeliczeniu karty', async ({ page }) => {
    await otworzPro(page);
    await expect(pdfBtn(page)).toBeVisible({ timeout: 20000 });

    // Znakujemy węzeł przycisku; po przeliczeniu karty ma to być TEN SAM węzeł.
    await page.evaluate(() => {
      document.querySelector('[data-patient-report-pdf-btn]').dataset.znacznikTestu = 'przed';
    });
    await page.fill('#weight', '20.7');
    await page.evaluate(() => document.activeElement && document.activeElement.blur());
    await page.fill('#weight', '21');
    await page.evaluate(() => document.activeElement && document.activeElement.blur());

    const stan = await page.evaluate(() => {
      const btny = document.querySelectorAll('[data-patient-report-pdf-btn]');
      return {
        ile: btny.length,
        tenSamWezel: btny[0] ? btny[0].dataset.znacznikTestu === 'przed' : false,
        wrappery: document.querySelectorAll('.current-summary-actions').length,
      };
    });
    expect(stan.ile, 'jeden przycisk PDF, nie duplikaty').toBe(1);
    expect(stan.wrappery, 'jeden wrapper akcji').toBe(1);
    expect(stan.tenSamWezel, 'przycisk przeżywa przeliczenie karty jako ten sam węzeł').toBe(true);
  });
});
