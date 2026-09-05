import { expect, test } from '../support/test-czas.mjs';

// Audyt sekcji „Ustawienia" 2026-09-05, znalezisko U1 (+ U7).
//
// U1 — pole liczbowe w „Technicznym panelu siatek centylowych" normalizowało wartość na zdarzeniu
//      `input`, czyli po KAŻDYM znaku, i wpisywało wynik z powrotem do pola. Ciąg „2.5" przechodził
//      przez: „2" → „2" (Number("2.") === 2, kropka zjadana) → „25" → clamp do maksimum 20.
//      Do tego pole miało `type="number"`, przy którym przeglądarka wycina przecinek dziesiętny
//      ZANIM kod go zobaczy — polskie „2,5" wracało z pola jako „25", też obcinane do 20.
//      Obie drogi kończyły się tym samym: lekarz prosił o krzywą 2,5 px, dostawał 20 px, a wartość
//      lądowała w `centileChartLineStyles` — kluczu synchronizowanym w chmurze, więc rozjeżdżała
//      siatki i PDF-y na wszystkich urządzeniach konta.
//
// U7 — zapis szedł przy każdym zdarzeniu `input` suwaka, czyli kilkadziesiąt razy na jedno
//      przeciągnięcie, do tego samego klucza chmurowego. Teraz jest dławik 400 ms.
//
// Testy jadą po prawdziwej stronie Ustawień i prawdziwej klawiaturze — nie podmieniamy niczego
// poza odczytem localStorage w asercjach.

const POLE = '#centileLineSettingsGrid .tech-chart-setting-row';
const HASLO = 'E2e#Ustawienia!2026';

async function otworzPanel(page) {
  await page.goto('/ustawienia.html', { waitUntil: 'load' });
  // Cała `.desktop-layout` jest schowana pod `html.vilda-auth-locked`, dopóki sejf jest
  // zamknięty — bez konta panel istnieje w DOM-ie, ale jest niewidoczny.
  await page.waitForFunction(() => Boolean(window.VildaVault));
  await page.evaluate(
    async (pw) => window.VildaVault.createUser(pw, { label: 'e2e', iterations: 10000 }),
    HASLO,
  );
  await page.waitForFunction(() => window.VildaVault.isUnlocked());
  await page.waitForFunction(
    () => !document.documentElement.classList.contains('vilda-auth-locked'),
  );
  // Sama klasa nie wystarcza: nakładka logowania znika chwilę później i do tego czasu
  // przechwytuje kliknięcia (klawiatura by przeszła, mysz nie). Czekamy na realny warunek,
  // a nie na odmierzony czas.
  await page.waitForFunction(() => {
    const root = document.getElementById('vilda-auth-ui-root');
    return !root || window.getComputedStyle(root).display === 'none';
  });

  // Akordeony są zamykane przez bootstrap strony (blok `sections.forEach(s => s.open = false)`
  // plus przebudowa po odblokowaniu sejfu), więc jednorazowe `open = true` bywa cofnięte.
  // Zamiast czekać odmierzony czas, otwieramy w pętli aż wiersz naprawdę ma wysokość.
  await expect.poll(
    () => page.evaluate((sel) => {
      const d = document.getElementById('settings-section-chart');
      if (!d) return false;
      if (!d.open) d.open = true;
      const row = document.querySelector(sel);
      return Boolean(row && row.getBoundingClientRect().height > 0);
    }, POLE),
    { message: 'panel techniczny musi być otwarty i widoczny', timeout: 20000 },
  ).toBe(true);
}

// Pierwszy wiersz pierwszej grupy to „Pionowe linie główne siatki" (klucz majorVerticalGrid,
// domyślnie 3.25 px) — bierzemy go po pozycji, żeby test nie zależał od polskiego tekstu etykiety.
const pierwszePole = (page) => page.locator(POLE).first().locator('input[type="text"], input[type="number"]');
const pierwszySuwak = (page) => page.locator(POLE).first().locator('input[type="range"]');

const zapisane = (page, klucz) => page.evaluate((k) => {
  try {
    const surowe = window.localStorage.getItem('centileChartLineStyles');
    if (!surowe) return null;
    const parsed = JSON.parse(surowe);
    return parsed && typeof parsed === 'object' ? parsed[k] : null;
  } catch (_) { return null; }
}, klucz);

// Zapis jest dławiony (400 ms), więc asercja MUSI czekać na stan, a nie czytać go raz.
// Odmierzanie `waitForTimeout(500)` dawałoby test kruchy czasowo — polling czeka na warunek.
const oczekujZapisu = (page, klucz, wartosc, opis) => expect
  .poll(() => zapisane(page, klucz), { message: opis, timeout: 5000 })
  .toBe(wartosc);

async function wpisz(page, tekst) {
  const pole = pierwszePole(page);
  await pole.click();
  await page.keyboard.press('ControlOrMeta+a');
  await page.keyboard.type(tekst, { delay: 15 });
}

test.describe('Ustawienia — techniczny panel siatek centylowych', () => {
  test('wpisane 2.5 px zostaje 2,5 px, a nie maksimum', async ({ page }) => {
    await otworzPanel(page);
    await wpisz(page, '2.5');
    await page.keyboard.press('Enter');

    await expect(pierwszePole(page)).toHaveValue('2.5');
    await oczekujZapisu(page, 'majorVerticalGrid', 2.5, 'zapis do stanu, nie tylko widok');
  });

  test('polski przecinek dziesiętny też działa', async ({ page }) => {
    await otworzPanel(page);
    await wpisz(page, '2,5');
    await page.keyboard.press('Enter');

    await oczekujZapisu(page, 'majorVerticalGrid', 2.5, 'normalizeValue zamienia przecinek na kropkę');
  });

  test('wartość poniżej minimum wraca do 0,25 px dopiero po zatwierdzeniu', async ({ page }) => {
    await otworzPanel(page);
    await wpisz(page, '0.1');
    // W trakcie pisania pole NIE może być przepisywane — inaczej „0.1" nigdy nie da się wpisać.
    await expect(pierwszePole(page)).toHaveValue('0.1');
    await page.keyboard.press('Enter');
    await oczekujZapisu(page, 'majorVerticalGrid', 0.25, 'clamp dolny dopiero przy zatwierdzeniu');
  });

  test('wartość ponad maksimum jest obcinana do 20 px', async ({ page }) => {
    await otworzPanel(page);
    await wpisz(page, '99');
    await page.keyboard.press('Enter');
    await oczekujZapisu(page, 'majorVerticalGrid', 20, 'clamp górny');
  });

  test('wyczyszczenie pola nie zmienia ustawienia', async ({ page }) => {
    await otworzPanel(page);
    await wpisz(page, '4');
    await page.keyboard.press('Enter');
    await oczekujZapisu(page, 'majorVerticalGrid', 4, 'wartość wyjściowa zapisana');

    const pole = pierwszePole(page);
    await pole.click();
    await page.keyboard.press('ControlOrMeta+a');
    await page.keyboard.press('Backspace');
    await page.keyboard.press('Tab'); // wyjście z pola = zatwierdzenie

    await expect(pole, 'puste pole wraca do zapisanej wartości').toHaveValue('4');
    await oczekujZapisu(page, 'majorVerticalGrid', 4, 'puste pole to rezygnacja, nie 0,25');
  });

  test('suwak nadal działa i zapisuje swoją wartość', async ({ page }) => {
    await otworzPanel(page);
    await pierwszySuwak(page).fill('6');
    await page.waitForFunction(() => {
      try {
        const s = JSON.parse(window.localStorage.getItem('centileChartLineStyles') || '{}');
        return s.majorVerticalGrid === 6;
      } catch (_) { return false; }
    });
    await expect(pierwszePole(page), 'pole liczbowe podąża za suwakiem').toHaveValue('6');
  });

  test('przeciągnięcie suwaka to jeden zapis, nie kilkadziesiąt', async ({ page }) => {
    await otworzPanel(page);
    await page.evaluate(() => {
      window.__zapisy = 0;
      const oryginal = window.localStorage.setItem.bind(window.localStorage);
      window.localStorage.setItem = function (klucz, wartosc) {
        if (klucz === 'centileChartLineStyles') window.__zapisy += 1;
        return oryginal(klucz, wartosc);
      };
    });

    const suwak = pierwszySuwak(page);
    await suwak.focus();
    for (let i = 0; i < 12; i += 1) await page.keyboard.press('ArrowRight');

    await page.waitForFunction(() => {
      try {
        const s = JSON.parse(window.localStorage.getItem('centileChartLineStyles') || '{}');
        return typeof s.majorVerticalGrid === 'number' && s.majorVerticalGrid > 3.25;
      } catch (_) { return false; }
    });

    const zapisy = await page.evaluate(() => window.__zapisy);
    expect(zapisy, '12 kroków suwaka nie może dać 12 zapisów klucza chmurowego')
      .toBeLessThanOrEqual(3);
  });

  test('„Przywróć domyślne grubości" wraca do wartości fabrycznych', async ({ page }) => {
    await otworzPanel(page);
    await wpisz(page, '7');
    await page.keyboard.press('Enter');
    await oczekujZapisu(page, 'majorVerticalGrid', 7, 'wartość przed resetem');

    await page.locator('#resetCentileLineStylesBtn').click();

    await expect(pierwszePole(page)).toHaveValue('3.25');
    await oczekujZapisu(page, 'majorVerticalGrid', 3.25, 'reset zapisany do stanu');
    await expect(page.locator('#centileLineSettingsStatus'))
      .toContainText('Przywrócono domyślne');
  });
});
