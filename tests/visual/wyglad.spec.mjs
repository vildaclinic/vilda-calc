import { expect, test } from '../support/test-czas.mjs';

// P-STYLE rata 1 (decyzja właściciela 2026-09-28): SIATKA ZRZUTÓW WYGLĄDU.
//
// PO CO. Zestaw e2e sprawdza zachowanie, nie piksele: kolor, cień albo odstęp mogą się zmienić
// niezauważenie. Porządkowanie stylów (tokeny, tryby wyglądu przez tokeny, skórka szkła jako baza)
// ma kryterium odbioru „brak zmiany wyglądu", a to da się wykazać tylko porównaniem obrazów.
//
// JAK. Każda strona z listy STRONY jest otwierana w trybie gościa, w każdym z czterech trybów
// z sekcji „Wygląd aplikacji" (TRYBY), na desktopie i na telefonie (projekty w
// playwright.visual.config.mjs), i porównywana z wzorcem PNG w tests/visual/wzorce/<projekt>/.
// Wzorce powstają WYŁĄCZNIE w CI (workflow „Wygląd" z opcją aktualizacji): czcionki i wygładzanie
// różnią się między systemami, więc lokalny przebieg na Macu nie zgodzi się z wzorcem z Linuksa.
//
// CO JEST ZAMROŻONE, żeby obraz był powtarzalny:
//   • zegar strony — fikstura z tests/support/test-czas.mjs (wspólna chwila zestawu e2e);
//   • sieć — żądania poza serwerem testowym są odrzucane, także Google Fonts: strona renderuje się
//     czcionką zapasową ze stosu, tą samą na każdym runnerze, bez zależności od cudzego serwera;
//   • animacje i kursor — opcje toHaveScreenshot w konfiguracji;
//   • bramka regulaminu i baner zgody analitycznej — ustawione w storage przed pierwszym skryptem;
//   • service worker — zablokowany, żeby baner aktualizacji nie wchodził w kadr.
// Dane w kalkulatorze są syntetyczne (same liczby, bez nazwisk).
test.use({ serviceWorkers: 'block' });

const STRONY = Object.freeze([
  { plik: 'index.html', nazwa: 'kalkulator', gosc: true, dane: true },
  { plik: 'app.html', nazwa: 'powloka', gosc: true },
  { plik: 'terminarz.html', nazwa: 'terminarz', gosc: true },
  { plik: 'notatki.html', nazwa: 'notatki', gosc: true },
  { plik: 'ustawienia.html', nazwa: 'ustawienia', gosc: true },
  { plik: 'kalkulator-klirens.html', nazwa: 'klirens', gosc: true },
  { plik: 'kontakt.html', nazwa: 'kontakt', gosc: false },
  { plik: 'przelicznik-jednostek.html', nazwa: 'przelicznik', gosc: false },
]);

// Preferencje jak z ustawień (klucze czytane przez ios26-ui.js) i klasa body, którą muszą dać.
const TRYBY = Object.freeze({
  jasny: { opis: 'domyślnym (szkło 0)', preferencje: {}, klasa: 'glass-level-0' },
  'szklo-4': { opis: 'szkła 4', preferencje: { glassLevel: '4' }, klasa: 'glass-level-4' },
  'kontrast-2': { opis: 'wysokiego kontrastu 2', preferencje: { highContrastEnabled: 'true', highContrastLevel: '2' }, klasa: 'high-contrast-level-2' },
  'ciemne-tlo-1': { opis: 'ciemnego tła 1', preferencje: { darkBgLevel: '1' }, klasa: 'dark-bg-level-1' },
});

const DOMYSLNE_PREFERENCJE = Object.freeze({ darkBgLevel: '0', glassLevel: '0', highContrastEnabled: 'false', highContrastLevel: '2' });

/** Klika „Korzystaj bez logowania", jeśli bramka logowania jest na wierzchu. */
async function trybGoscia(page) {
  const przycisk = page.getByRole('button', { name: 'Korzystaj bez logowania', exact: true });
  if ((await przycisk.count()) && (await przycisk.first().isVisible())) {
    await przycisk.first().click();
    await page.waitForFunction(() => !document.documentElement.classList.contains('vilda-auth-locked'));
  }
}

async function otworz(page, strona, tryb) {
  await page.route(/.*/, (route) => (new URL(route.request().url()).host === '127.0.0.1:4173' ? route.continue() : route.abort()));
  await page.addInitScript(() => {
    try {
      window.localStorage.setItem('vilda-terms-accepted-v1', JSON.stringify({ version: 1, acceptedAtISO: new Date().toISOString() }));
      window.localStorage.setItem('analyticsConsent', 'denied');
    } catch (_) { /* brak storage — pomiń */ }
  });
  await page.goto(`/${strona.plik}`, { waitUntil: 'load' });
  if (strona.gosc) await trybGoscia(page);
  await page.waitForFunction(() => Boolean(window.VildaPersistence && typeof window.VildaPersistence.writePreferenceRaw === 'function'));
  // Zapis jak ze strony ustawień; `force`, bo w trybie gościa adapter odrzuca zwykłe zapisy preferencji.
  await page.evaluate((preferencje) => {
    for (const [klucz, wartosc] of Object.entries(preferencje)) window.VildaPersistence.writePreferenceRaw(klucz, wartosc, { force: true });
  }, { ...DOMYSLNE_PREFERENCJE, ...tryb.preferencje });
  await page.reload({ waitUntil: 'load' });
  if (strona.gosc) await trybGoscia(page);
  await expect(page.locator('body'), 'ios26-ui.js nakłada klasę trybu przy starcie').toHaveClass(new RegExp(`(^|\\s)${tryb.klasa}(\\s|$)`));
}

/** Wpisuje fikcyjną pacjentkę (same liczby) i przelicza kartę, żeby w kadrze były karty wyników. */
async function daneSyntetyczne(page) {
  await page.waitForFunction(() => typeof window.update === 'function');
  await page.evaluate(() => {
    const ustaw = (id, v) => {
      const el = document.getElementById(id);
      el.value = String(v);
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    };
    ustaw('age', 10); ustaw('ageMonths', 3); ustaw('sex', 'F'); ustaw('weight', 32); ustaw('height', 138);
    window.update();
  });
  await expect(page.locator('#bmiResult')).toContainText('BMI');
}

for (const strona of STRONY) {
  for (const [id, tryb] of Object.entries(TRYBY)) {
    test(`${strona.nazwa} w trybie ${tryb.opis}`, async ({ page }) => {
      await otworz(page, strona, tryb);
      if (strona.dane) await daneSyntetyczne(page);
      await page.evaluate(() => document.fonts.ready);
      // dławiki odświeżania (odznaki, pasek statusu) kończą pracę w ułamku sekundy
      await page.waitForTimeout(600);
      await expect(page).toHaveScreenshot(`${strona.nazwa}--${id}.png`, { fullPage: true });
    });
  }
}
