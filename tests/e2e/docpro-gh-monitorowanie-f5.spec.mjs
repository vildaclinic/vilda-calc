import { expect, test } from '../support/test-czas.mjs';

// P-DOCPRO-PETLA (2026-10-06). F5 na DocPro z kartą GH/IGF-1 na zakładce „Monitorowanie” zawieszał stronę.
//
// ZMIERZONE przed poprawką (audyt c730011, Chromium headless, świeży sejf, bez punktów terapii GH):
// odtwarzanie stanu DocPro (docpro_state_persist.js) uruchamia MutationObserver na body i przy każdej
// mutacji ponawia przebieg odtwarzania. Do DOMContentLoaded body.js-loading ukrywa .main-content
// (visibility:hidden), więc sprawdzenie „karta otwarta” widziało otwartą kartę jako zamkniętą. Każdy
// przebieg klikał przełącznik karty (karta na przemian zamykała się i otwierała, przy otwarciu wracała
// na „Zalecenia”) i przycisk „Monitorowanie”, który odświeża monitor — to mutacje childList, więc
// obserwator ruszał znowu, w mikrozadaniu. Sonda: 60 kliknięć w ~60 ms, a pętla nie oddawała sterowania.
// Słuchacz DOMContentLoaded zdejmujący js-loading, zdarzenie load i timer rozłączenia po 4 s nigdy nie
// ruszały: page.evaluate wisiał, a karta po przerwaniu pętli zostawała ZAMKNIĘTA.
//
// REGUŁA po poprawce: odtwarzanie ocenia otwarcie karty i zakładki po jej własnym display (nie po
// widoczności dziedziczonej ze strony), klika przełącznik tylko wtedy, gdy stan naprawdę się różni,
// a obserwator pilnuje swojego terminu także we własnym wywołaniu. Zapisywany stan się nie zmienia.
// Dane wyłącznie FIKCYJNE; własne konto sejfu w efemerycznym profilu.
test.use({ serviceWorkers: 'block' });

const HASLO = 'E2e#DocproPetla!2026a';
// Odtworzenie stanu DocPro biegnie w przebiegach do 1,5 s po starcie strony (+350 ms na zapis).
const PO_ODTWORZENIU_MS = 2500;
// Przed poprawką strona nie dochodziła do load nigdy — limit tylko po to, by test padł z czytelnym powodem.
const LIMIT_LADOWANIA_MS = 20_000;

async function zaloguj(page) {
  page.on('dialog', (d) => d.accept());
  await page.addInitScript(() => {
    try {
      window.localStorage.setItem('vilda-terms-accepted-v1',
        JSON.stringify({ version: 1, acceptedAtISO: new Date().toISOString() }));
      // Zapamiętany numer PWZ pomija bramkę modułu lekarskiego; wartość jawnie fikcyjna.
      window.localStorage.setItem('pwzNumber', '0000000');
    } catch (_) { /* brak storage — pomiń */ }
    // Uprawnienie tylko dla własnego fikcyjnego konta w tym efemerycznym profilu (wzorzec
    // z wiek-kostny-kolejne-wizyty): jawny hook produkcyjnego modułu, przy KAŻDYM ładowaniu strony,
    // także po F5 — przycisk karty GH/IGF-1 siedzi za bramką PRO.
    const planTestowy = () => {
      const access = window.VildaProAccess;
      if (!access) return;
      access.__setTokenModeForTest(false);
      access.setPlan('pro', '2099-12-31T23:59:59.000Z');
    };
    document.addEventListener('DOMContentLoaded', planTestowy, { once: true });
    document.addEventListener('vilda:session-changed', planTestowy);
    // Licznik kliknięć przełącznika karty i zakładki w tym ładowaniu strony. Słuchacz w fazie
    // przechwytywania na dokumencie widzi też kliknięcia programowe odtwarzania (element.click()).
    window.__klikniecia = { toggleIgfTests: 0, ghTabMonBtn: 0 };
    document.addEventListener('click', (e) => {
      const id = e.target && e.target.id;
      if (id && Object.prototype.hasOwnProperty.call(window.__klikniecia, id)) window.__klikniecia[id] += 1;
    }, true);
  });
  await page.goto('/index.html', { waitUntil: 'load' });
  await page.waitForFunction(() => Boolean(window.VildaVault));
  await page.evaluate(async (pw) => window.VildaVault.createUser(pw, { label: 'e2e', iterations: 10000 }), HASLO);
  await page.reload({ waitUntil: 'load' });
  await page.waitForFunction(() => Boolean(window.VildaVault) && window.VildaVault.isUnlocked());
  await page.waitForFunction(() => !document.documentElement.classList.contains('vilda-auth-locked'));
}

async function docProGotowe(page) {
  await page.waitForFunction(() => typeof window.refreshGHTherapyMonitor === 'function'
    && Boolean(window.vildaGhIgfPersistApi), null, { timeout: 30_000 });
  await page.waitForTimeout(PO_ODTWORZENIU_MS);
}

async function naDocPro(page) {
  await page.goto('/docpro.html', { waitUntil: 'load' });
  await docProGotowe(page);
  // Okno „Moduł profesjonalny” i baner analityki zasłaniają przyciski — zamykamy je jak użytkownik.
  const potwierdzam = page.locator('#professionalConfirmBtn');
  if (await potwierdzam.isVisible()) await potwierdzam.click();
  const bezAnalityki = page.getByRole('button', { name: 'Nie zgadzam się', exact: true });
  if (await bezAnalityki.isVisible()) await bezAnalityki.click();
}

// Strona po przeładowaniu musi dojść do load i odpowiadać na page.evaluate.
async function zaladowana(page, jak) {
  await jak();
  const odpowiedz = await Promise.race([
    page.evaluate(() => document.readyState),
    new Promise((r) => { setTimeout(() => r('brak odpowiedzi strony'), 5000); }),
  ]);
  expect(odpowiedz, 'page.evaluate odpowiada po przeładowaniu').toBe('complete');
  await docProGotowe(page);
}

const f5 = (page) => zaladowana(page, () => page.reload({ waitUntil: 'load', timeout: LIMIT_LADOWANIA_MS }));

async function stanKarty(page) {
  return page.evaluate(() => {
    const widoczny = (id) => {
      const e = document.getElementById(id);
      if (!e) return false;
      const s = getComputedStyle(e);
      return s.display !== 'none' && s.visibility !== 'hidden';
    };
    const mon = document.getElementById('ghTabMonBtn');
    return {
      karta: widoczny('ghIgfTherapyCard'),
      zalecenia: widoczny('ghTabRecPanel'),
      monitorowanie: widoczny('ghTabMonPanel'),
      zakladkaMon: mon ? mon.getAttribute('aria-selected') : null,
    };
  });
}

const NA_MONITOROWANIU = { karta: true, zalecenia: false, monitorowanie: true, zakladkaMon: 'true' };
const NA_ZALECENIACH = { karta: true, zalecenia: true, monitorowanie: false, zakladkaMon: 'false' };

// Stan po odtworzeniu jest trwały: ten sam po zakończeniu przebiegów i chwilę później.
async function stabilny(page, oczekiwany, komunikat) {
  expect(await stanKarty(page), komunikat).toEqual(oczekiwany);
  await page.waitForTimeout(1000);
  expect(await stanKarty(page), `${komunikat} — bez przełączania po zakończeniu odtwarzania`).toEqual(oczekiwany);
}

const klikniecia = (page) => page.evaluate(() => window.__klikniecia);

async function otworzMonitorowanie(page) {
  await page.locator('#toggleIgfTests').click();
  await expect(page.locator('#ghIgfTherapyCard')).toBeVisible();
  await page.locator('#ghTabMonBtn').click();
  await expect(page.locator('#ghTabMonPanel')).toBeVisible();
  expect(await stanKarty(page)).toEqual(NA_MONITOROWANIU);
}

test('A: karta GH na „Monitorowanie” — F5 i powrót ze Start odtwarzają kartę i zakładkę, strona odpowiada', async ({ page }) => {
  test.setTimeout(150_000);
  await zaloguj(page);
  await naDocPro(page);
  await otworzMonitorowanie(page);
  await page.waitForTimeout(600); // odroczony autozapis stanu UI (220 ms)

  await f5(page);
  await stabilny(page, NA_MONITOROWANIU, 'po F5 karta otwarta na „Monitorowanie”');
  // Przełącznik karty i zakładka kliknięte po razie — odtwarzanie zbiega się i staje.
  expect(await klikniecia(page), 'kliknięcia odtwarzania po F5').toEqual({ toggleIgfTests: 1, ghTabMonBtn: 1 });

  // Ta sama ścieżka bez F5: Start i z powrotem na DocPro.
  await page.goto('/index.html', { waitUntil: 'load', timeout: LIMIT_LADOWANIA_MS });
  await zaladowana(page, () => page.goto('/docpro.html', { waitUntil: 'load', timeout: LIMIT_LADOWANIA_MS }));
  await stabilny(page, NA_MONITOROWANIU, 'po powrocie ze Start karta otwarta na „Monitorowanie”');
  expect(await klikniecia(page), 'kliknięcia odtwarzania po powrocie').toEqual({ toggleIgfTests: 1, ghTabMonBtn: 1 });
});

test('B: karta GH zamknięta przy aktywnym „Monitorowanie” — F5 nie zawiesza strony; „Zalecenia” bez zmian', async ({ page }) => {
  test.setTimeout(150_000);
  await zaloguj(page);
  await naDocPro(page);
  await otworzMonitorowanie(page);
  await page.locator('#toggleIgfTests').click();
  await expect(page.locator('#ghIgfTherapyCard')).toBeHidden();
  await page.waitForTimeout(600);

  await f5(page);
  // Zachowanie sprzed poprawki, NIE zmieniane tutaj: zapis UI notuje „Monitorowanie” po display samego
  // panelu (ghMonitorOpen), a odtwarzanie otwiera kartę, gdy był otwarty monitor
  // (igfTherapyOpen || ghMonitorOpen). Karta wraca więc otwarta na „Monitorowanie” — raz i trwale.
  await stabilny(page, NA_MONITOROWANIU, 'po F5 karta wraca na „Monitorowanie” i zostaje');
  expect(await klikniecia(page), 'kliknięcia odtwarzania po F5').toEqual({ toggleIgfTests: 1, ghTabMonBtn: 1 });

  // Ścieżka, która działała przed poprawką, nadal działa: karta na „Zalecenia” wraca na „Zalecenia”.
  await page.locator('#ghTabRecBtn').click();
  expect(await stanKarty(page)).toEqual(NA_ZALECENIACH);
  await page.waitForTimeout(600);
  await f5(page);
  await stabilny(page, NA_ZALECENIACH, 'po F5 karta otwarta na „Zalecenia”');
  expect(await klikniecia(page), 'kliknięcia odtwarzania po F5 na „Zalecenia”').toEqual({ toggleIgfTests: 1, ghTabMonBtn: 0 });
});
