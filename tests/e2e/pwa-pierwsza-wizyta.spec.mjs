import { expect, test } from '@playwright/test';

// P-SW-PIERWSZA-WIZYTA (decyzja właściciela 2026-09-29): pierwsze przejęcie strony przez service workera
// nie przeładowuje strony. ios26-ui.js przeładowywał ją na każdy `controllerchange` — także wtedy, gdy strona
// nie miała wcześniej kontrolera (pierwsza wizyta, profil po wyczyszczeniu danych, urządzenie, na którym
// instalacja dotąd się nie udawała). Taka strona przyszła właśnie z sieci w bieżącej wersji, więc przeładowanie
// niczego nie daje, a od P-SW-PRECACHE (SW 1.1.105) instalacja trwa sekundy, nie ~85 s, i przeładowanie trafia
// w pracę użytkownika. Aktualizacja po „Aktualizuj” (strona MIAŁA kontrolera) przeładowuje jak dotąd.
//
// Prawdziwy SW i prawdziwa strona główna. Brak danych pacjenta.
test.use({ serviceWorkers: 'allow' });

async function otworz(page) {
  await page.addInitScript(() => {
    try {
      window.localStorage.setItem('vilda-terms-accepted-v1', JSON.stringify({ version: 1, acceptedAtISO: new Date().toISOString() }));
    } catch (_) { /* brak storage — pomiń */ }
  });
  await page.goto('/index.html', { waitUntil: 'load' });
}

// Baner aktualizacji leży pod ekranem powitalnym — do aplikacji wchodzimy jak użytkownik, trybem gościa
// (wybór zostaje w profilu, więc po przeładowaniu ekranu powitalnego już nie ma).
async function wejdzJakoGosc(page) {
  await page.getByRole('button', { name: 'Korzystaj bez logowania', exact: true }).click();
  await page.waitForFunction(() => !document.documentElement.classList.contains('vilda-auth-locked'));
}

const maKontrolera = (page) => page.evaluate(() => Boolean(navigator.serviceWorker && navigator.serviceWorker.controller));

// Znacznik w oknie przeżywa tylko w tym samym dokumencie — po przeładowaniu go nie ma.
const oznacz = (page) => page.evaluate(() => { window.__e2eTenSamDokument = true; });

const stan = (page) => page.evaluate(() => {
  const s = window.__vildaServiceWorkerClientLifecycle || {};
  return {
    kontroler: Boolean(navigator.serviceWorker.controller),
    kontrolerNaStarcie: s.controllerchangeHadControllerAtStart,
    pierwszePrzejecia: s.controllerchangeFirstClaimCount,
    zmianyKontrolera: s.controllerchangeHandledCount,
    przeladowano: s.reloadedAfterControllerChange,
    tenSamDokument: window.__e2eTenSamDokument === true,
  };
});

test('pierwsza wizyta: SW przejmuje stronę, a strona się nie przeładowuje', async ({ page }) => {
  test.setTimeout(180_000);
  let zaladowania = 0;
  page.on('load', () => { zaladowania += 1; });
  await otworz(page);
  await oznacz(page);
  expect(await maKontrolera(page), 'świeży profil: strona bez kontrolera').toBe(false);

  await expect.poll(() => maKontrolera(page), { timeout: 150_000, intervals: [500] }).toBe(true);
  // Dawniej przeładowanie przychodziło zaraz po przejęciu — dajemy mu czas, żeby test nie przeszedł przypadkiem.
  await page.waitForTimeout(3000);

  expect(await stan(page)).toEqual({
    kontroler: true,
    kontrolerNaStarcie: false,
    pierwszePrzejecia: 1,
    zmianyKontrolera: 1,
    przeladowano: false,
    tenSamDokument: true,
  });
  expect(zaladowania, 'jedno załadowanie strony — bez przeładowania').toBe(1);
});

test('aktualizacja: strona z kontrolerem po „Aktualizuj” przeładowuje się jak dotąd', async ({ page }) => {
  test.setTimeout(240_000);
  await otworz(page);
  await wejdzJakoGosc(page);
  await expect.poll(() => maKontrolera(page), { timeout: 150_000, intervals: [500] }).toBe(true);

  // Druga wizyta: strona startuje już pod kontrolą SW.
  await page.reload({ waitUntil: 'load' });
  await page.waitForFunction(() => !document.documentElement.classList.contains('vilda-auth-locked'));
  await oznacz(page);
  // Warunek wstępny sprawdzany bez nowych pól stanu — ten test przechodzi także na ios26-ui.js sprzed zmiany
  // (sprawdzone), czyli dowodzi, że ścieżka aktualizacji się nie zmieniła.
  expect(await maKontrolera(page), 'druga wizyta: strona startuje pod kontrolą SW').toBe(true);

  // Nowa wersja SW pod tym samym zakresem — jak po wdrożeniu. Aplikacja pokazuje baner, bo strona ma kontrolera.
  await page.evaluate(() => navigator.serviceWorker.register('/__test-service-worker-kalorii.js?wersja=9.9.9-e2e', { scope: '/' }));
  const aktualizuj = page.locator('#sw-update-banner #sw-refresh');
  await expect(aktualizuj).toBeVisible({ timeout: 60_000 });

  const przeladowanie = page.waitForEvent('load', { timeout: 60_000 });
  await aktualizuj.click();
  await przeladowanie;

  expect(await page.evaluate(() => window.__e2eTenSamDokument), 'nowy dokument po przeładowaniu').toBeUndefined();
  await expect.poll(() => page.evaluate(() => (navigator.serviceWorker.controller || {}).scriptURL || ''))
    .toContain('/__test-service-worker-kalorii.js?wersja=9.9.9-e2e');
});
