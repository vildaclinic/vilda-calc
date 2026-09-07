import { expect, test } from '../support/test-czas.mjs';

// Etap 2 silnika opisu (decyzja właściciela 2026-09-07): w karcie „Podsumowanie wyników"
// nad „Raport PDF dla pacjenta" stoi przycisk, który składa opis pacjenta i kopiuje go
// do schowka — BEZ pokazywania na stronie. Właściciel testuje opis w prawdziwej
// dokumentacji, a karta ma nie rosnąć.
//
// Ten plik sprawdza to, czego test jednostkowy nie może: że przycisk naprawdę wstaje
// w tym wrapperze, w tym miejscu, że przeżywa ponowny render karty, że do schowka
// trafia tekst opisu, a na stronę — nie; i że odmowa schowka nie jest cicha.
test.use({ serviceWorkers: 'block' });

const HASLO = 'E2e#OpisSchowek!26aa';

// Chłopiec 7 lat z dwoma pomiarami w historii — trajektoria ma z czego liczyć.
const REKORD = {
  name: 'Testowy Adam',
  user: { lastName: 'Testowy', firstName: 'Adam', sex: 'M', age: 7, ageMonths: 0, height: 117, weight: 20.5 },
  growthBasic: {
    data: {
      measurements: [
        { ageMonths: 48, ageYears: 4, height: 104, weight: 16 },
        { ageMonths: 72, ageYears: 6, height: 113, weight: 19 },
      ],
    },
  },
};

async function otworz(page, { schowek = 'dziala' } = {}) {
  await page.addInitScript((tryb) => {
    try {
      window.localStorage.setItem(
        'vilda-terms-accepted-v1',
        JSON.stringify({ version: 1, acceptedAtISO: new Date().toISOString() }),
      );
    } catch (_) { /* brak storage — pomiń */ }
    // Schowek pod kontrolą testu: zapis ląduje w window.__schowek albo jest odrzucany.
    const writeText = tryb === 'odmawia'
      ? () => Promise.reject(new Error('NotAllowedError'))
      : (t) => { window.__schowek = t; return Promise.resolve(); };
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    if (tryb === 'odmawia') document.execCommand = () => false;
  }, schowek);
  await page.goto('/index.html', { waitUntil: 'load' });
  await page.waitForFunction(() => Boolean(window.VildaVault));
  await page.evaluate(
    async (pw) => window.VildaVault.createUser(pw, { label: 'e2e', iterations: 10000 }),
    HASLO,
  );
  await page.reload({ waitUntil: 'load' });
  await page.waitForFunction(() => Boolean(window.VildaVault) && window.VildaVault.isUnlocked());
  await page.waitForFunction(() => !document.documentElement.classList.contains('vilda-auth-locked'));
  await page.waitForFunction(() => Boolean(window.VildaPatientNarrativeUI) && typeof window.applyLoadedData === 'function');
}

// Historia z rekordu + pola formularza jak lekarz + tryb PRO prawdziwym przełącznikiem.
// Wzrost rodziców siedzi w zwiniętej sekcji zaawansowanej, więc idzie przez wartość
// pola i zdarzenia — tak jak w tests/e2e/diet-recommendations-logic.spec.mjs.
async function wypelnij(page, { zHistoria = true } = {}) {
  if (zHistoria) {
    await page.evaluate((rekord) => window.applyLoadedData(JSON.parse(JSON.stringify(rekord))), REKORD);
  }
  // Po wczytaniu rekordu płeć jest zablokowana (idzie z rekordu) — wybieramy ją
  // tylko wtedy, gdy formularz jest pusty.
  if (await page.locator('#sex').isEnabled()) await page.selectOption('#sex', 'M');
  await page.fill('#age', '7');
  await page.fill('#ageMonths', '0');
  await page.fill('#height', '117');
  await page.fill('#weight', '20.5');
  await page.evaluate(() => {
    const ustaw = (id, v) => {
      const el = document.getElementById(id);
      if (!el) return;
      el.value = String(v);
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    };
    ustaw('advMotherHeight', 163);
    ustaw('advFatherHeight', 180);
    // Przełącznik PRO może być schowany w zwiniętym panelu — ta sama ścieżka co klik:
    // zmiana stanu i zdarzenie „change", na którym wisi obsługa trybu.
    const pro = document.getElementById('resultsModeToggle');
    if (pro && !pro.checked) {
      pro.checked = true;
      pro.dispatchEvent(new Event('change', { bubbles: true }));
    }
    if (typeof window.calculateGrowthAdvanced === 'function') window.calculateGrowthAdvanced();
  });
}

const przycisk = (page) => page.locator('.current-summary-actions [data-patient-narrative-copy-btn]');
const toast = (page) => page.locator('#patientReportPdfToast, #patientNarrativeToast');

test.describe('„Kopiuj opis pacjenta" w karcie Podsumowanie wyników', () => {
  test('przycisk stoi nad „Raport PDF dla pacjenta" i przeżywa ponowny render karty', async ({ page }) => {
    await otworz(page);
    await wypelnij(page);
    await expect(przycisk(page)).toBeVisible({ timeout: 20000 });

    const porzadek = await page.evaluate(() => {
      const wr = document.querySelector('.current-summary-actions');
      const kopiuj = wr.querySelector('[data-patient-narrative-copy-btn]');
      const pdf = wr.querySelector('[data-patient-report-pdf-btn]');
      return {
        tenSamWrapper: Boolean(kopiuj && pdf),
        kopiujPrzedPdf: Boolean(kopiuj && pdf && (kopiuj.compareDocumentPosition(pdf) & Node.DOCUMENT_POSITION_FOLLOWING)),
        ile: document.querySelectorAll('[data-patient-narrative-copy-btn]').length,
        etykieta: kopiuj && kopiuj.textContent.trim(),
      };
    });
    expect(porzadek.tenSamWrapper).toBe(true);
    expect(porzadek.kopiujPrzedPdf, 'nad przyciskiem PDF, nie pod').toBe(true);
    expect(porzadek.ile).toBe(1);
    expect(porzadek.etykieta).toBe('Kopiuj opis pacjenta');

    // Zmiana masy przerysowuje kartę (wrapper akcji jest budowany od nowa) — przycisk
    // ma wrócić dokładnie raz, nie zniknąć i nie zdublować się.
    await page.fill('#weight', '21');
    await expect(przycisk(page)).toBeVisible();
    await expect.poll(() => page.evaluate(
      () => document.querySelectorAll('[data-patient-narrative-copy-btn]').length,
    )).toBe(1);
  });

  test('kliknięcie kopiuje akapit do schowka i NIE pokazuje go na stronie', async ({ page }) => {
    await otworz(page);
    await wypelnij(page);
    await expect(przycisk(page)).toBeVisible({ timeout: 20000 });

    await przycisk(page).click();
    await expect(toast(page)).toContainText('skopiowano do schowka');

    const wynik = await page.evaluate(() => ({
      schowek: window.__schowek || '',
      naStronie: document.body.innerText,
    }));
    // Ten chłopiec na siatce OLAF spada z 104 cm w 4. roku na 117 cm w 7. — karta
    // stawia flagę deceleracji, więc przebieg idzie zdaniem o obniżeniu pozycji.
    expect(wynik.schowek).toContain('W wieku 7 lat chłopiec mierzy 117 cm');
    expect(wynik.schowek).toContain('pozycja centylowa wzrostu obniżyła się o');
    expect(wynik.schowek).toContain('Tempo wzrastania liczone z ostatnich 12 miesięcy obserwacji wynosi');
    expect(wynik.schowek).toContain('Wzrost matki wynosi 163 cm, ojca 180 cm; potencjał genetyczny wzrostu (MPH) oceniono na 178 cm (±8,5 cm,');
    expect(wynik.schowek).toContain('Prognozowany wzrost ostateczny wynosi');
    expect(wynik.schowek, 'jeden akapit, nie lista').not.toContain('\n');
    // Opis ma zostać w schowku — na stronie nie ma go w ogóle.
    expect(wynik.naStronie).not.toContain('pozycja centylowa wzrostu obniżyła się o');
    expect(wynik.naStronie).not.toContain('W wieku 7 lat chłopiec mierzy');
    expect(wynik.naStronie).not.toContain('potencjał genetyczny wzrostu (MPH)');
  });

  test('odmowa schowka nie jest cicha', async ({ page }) => {
    await otworz(page, { schowek: 'odmawia' });
    await wypelnij(page);
    await expect(przycisk(page)).toBeVisible({ timeout: 20000 });

    await przycisk(page).click();
    await expect(toast(page)).toContainText('odmówiła dostępu do schowka');
    expect(await page.evaluate(() => window.__schowek)).toBeUndefined();
  });

  test('bez historii pomiarów przycisk mówi, czego brakuje, i niczego nie kopiuje', async ({ page }) => {
    await otworz(page);
    await wypelnij(page, { zHistoria: false });
    await expect(przycisk(page)).toBeVisible({ timeout: 20000 });

    await przycisk(page).click();
    await expect(toast(page)).toContainText('co najmniej dwóch pomiarów');
    expect(await page.evaluate(() => window.__schowek)).toBeUndefined();
  });
});
