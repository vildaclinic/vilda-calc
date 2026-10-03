import { expect, test } from '../support/test-czas.mjs';

// Karta „Zaawansowane obliczenia wzrostowe" z wynikami nie przewija dokumentu w poziomie.
//
// Przed poprawką dokument wystawał o 39 px przy 390×844 i o 31 px przy 1280×900. Skan
// `body *` wskazywał tabelę odcinków trajektorii, ale ta jest przycinana przez własny kontener
// (`.vtap-tb { overflow-x: auto }` wewnątrz `.vtap { overflow: hidden }`) i do przewijania
// dokumentu nie dokłada nic. Wystawał TEKST etykiety „Anonimizuj — tylko inicjały" pod przyciskiem
// „Generuj raport": globalne `input { width: 100% }` rozciągało checkbox na całą szerokość karty,
// a `flex: none` nie pozwalało mu się skurczyć, więc tekst (węzeł tekstowy, nie element — stąd
// niewidoczny dla skanu elementów) lądował za prawą krawędzią karty.
//
// Plik „-mobile" → projekt mobile-chromium; blok desktopowy nadpisuje viewport.
// Dane FIKCYJNE (dziewczynka 10 lat i trzy wcześniejsze pomiary utworzone na potrzeby testu).
test.use({ serviceWorkers: 'block' });

const HASLO = 'E2e#UkladAdv!26a';

async function otworz(page) {
  await page.addInitScript(() => {
    try {
      window.localStorage.setItem(
        'vilda-terms-accepted-v1',
        JSON.stringify({ version: 1, acceptedAtISO: new Date().toISOString() }),
      );
    } catch (_) { /* brak storage — pomiń */ }
  });
  await page.goto('/index.html', { waitUntil: 'load' });
  await page.waitForFunction(() => Boolean(window.VildaVault));
  await page.evaluate(
    async (pw) => window.VildaVault.createUser(pw, { label: 'e2e', iterations: 10000 }),
    HASLO,
  );
  await page.reload({ waitUntil: 'load' });
  await page.waitForFunction(() => Boolean(window.VildaVault) && window.VildaVault.isUnlocked());
  await page.waitForFunction(
    () => !document.documentElement.classList.contains('vilda-auth-locked'),
  );
  await page.waitForFunction(() => Boolean(window.VildaProAccess));
  // Pomiar układu wymaga otwartej karty profesjonalnej. Samo wymuszenie
  // kliknięcia nie włącza trybu, a jego strażnik ponownie ukrywa wyniki.
  await page.evaluate(() => {
    window.VildaProAccess.hasAccess = () => true;
    document.dispatchEvent(new CustomEvent('vildaProAccessChanged', { detail: { plan: 'pro' } }));
    const tryb = document.getElementById('resultsModeToggle');
    if (tryb && !tryb.checked) {
      tryb.checked = true;
      tryb.dispatchEvent(new Event('change', { bubbles: true }));
    }
  });
}

const POMIARY = [
  { wiek: '4', wzrost: '101.5', masa: '15.8' },
  { wiek: '5', wzrost: '107.9', masa: '17.6' },
  { wiek: '6', wzrost: '113.8', masa: '19.9' },
];

// Karta podpina uchwyt przycisku leniwie i dopiero wtedy tworzy pierwszy wiersz pomiarowy —
// czekamy na znacznik, który aplikacja sama stawia w DOM (jak w hv-sds-trzy-miejsca.spec.mjs).
async function otworzKarteZWynikami(page) {
  await page.evaluate(() => {
    document.getElementById('age').value = '10';
    document.getElementById('sex').value = 'F';
    document.getElementById('height').value = '135';
    document.getElementById('weight').value = '30';
    if (typeof window.update === 'function') window.update();
  });
  await page.waitForSelector(
    '#toggleAdvancedGrowth[data-vilda-advanced-growth-toggle-attached="true"]',
    { state: 'attached' },
  );
  await expect(page.locator('#toggleAdvancedGrowth')).toBeEnabled();
  await page.locator('#toggleAdvancedGrowth').click();
  await expect(page.locator('#advancedGrowthForm'), 'karta zaawansowana się odsłoniła')
    .toBeVisible();
  const wiersze = page.locator('#advMeasurements .measure-row');
  await expect(wiersze.first()).toBeAttached();

  for (let i = 0; i < POMIARY.length; i += 1) {
    if ((await wiersze.count()) < i + 1) {
      await page.evaluate(() => document.getElementById('advAddMeasurementBtn').click());
      await expect(wiersze).toHaveCount(i + 1);
    }
    await page.evaluate(({ idx, p }) => {
      const w = document.querySelectorAll('#advMeasurements .measure-row')[idx];
      const set = (sel, v) => {
        const e = w.querySelector(sel);
        if (e) { e.value = v; e.dispatchEvent(new Event('input', { bubbles: true })); }
      };
      set('.adv-age-years', p.wiek);
      set('.adv-height', p.wzrost);
      set('.adv-weight', p.masa);
    }, { idx: i, p: POMIARY[i] });
  }
  await page.evaluate(() => {
    if (typeof window.calculateGrowthAdvanced === 'function') window.calculateGrowthAdvanced();
  });
  await page.waitForSelector('#advResults .vtap');

  // Rozwinięta tabela odcinków trajektorii (domyślnie zwinięta) — ma przewijać się w SWOIM
  // kontenerze, nie w dokumencie.
  await page.evaluate(() => {
    const det = document.querySelector('#advResults .vtap-det');
    if (det) det.open = true;
  });
  await expect(page.locator('#advResults .vtap-tb table')).toBeVisible();
  await expect(page.locator('#advReportActions .adv-report-anon')).toBeVisible();
}

async function uklad(page) {
  return page.evaluate(() => {
    const de = document.documentElement;
    const karta = document.getElementById('advancedGrowthForm').getBoundingClientRect();
    const etykieta = document.querySelector('#advReportActions .adv-report-anon');
    const zakres = document.createRange();
    zakres.selectNodeContents(etykieta);
    const tekst = zakres.getBoundingClientRect();
    const tb = document.querySelector('#advResults .vtap-tb');
    return {
      scrollWidth: de.scrollWidth,
      clientWidth: de.clientWidth,
      kartaPrawa: karta.right,
      etykietaPrawa: tekst.right,
      checkbox: document.getElementById('advReportAnon').getBoundingClientRect().width,
      tabelaOverflowX: getComputedStyle(tb).overflowX,
    };
  });
}

async function sprawdzUklad(page) {
  await otworz(page);
  await otworzKarteZWynikami(page);
  const u = await uklad(page);

  expect(
    u.scrollWidth,
    `dokument nie przewija się w poziomie (scrollWidth ${u.scrollWidth}, clientWidth ${u.clientWidth})`,
  ).toBeLessThanOrEqual(u.clientWidth);
  expect(u.etykietaPrawa, 'opis „Anonimizuj — tylko inicjały" mieści się w karcie')
    .toBeLessThanOrEqual(u.kartaPrawa);
  expect(u.checkbox, 'checkbox anonimizacji ma własny rozmiar, a nie szerokość karty')
    .toBeLessThan(40);
  expect(u.tabelaOverflowX, 'tabela odcinków przewija się we własnym kontenerze').toBe('auto');
}

test.describe('telefon', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('karta z wynikami nie przewija dokumentu w poziomie przy 390 px', async ({ page }) => {
    await sprawdzUklad(page);
  });
});

test.describe('desktop', () => {
  test.use({ viewport: { width: 1280, height: 900 }, isMobile: false, hasTouch: false, deviceScaleFactor: 1 });

  test('karta z wynikami nie przewija dokumentu w poziomie przy 1280 px', async ({ page }) => {
    await sprawdzUklad(page);
  });
});
