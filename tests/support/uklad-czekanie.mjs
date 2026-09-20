/**
 * Bramki układu strony — dla KLIKNIĘĆ, które inaczej ścigają się z przewijaniem i przepływem.
 *
 * DLACZEGO TO JEST OSOBNY MODUŁ. `click()` i `check()` wymagają od Playwrighta stanu
 * „stable": prostokąt elementu musi być taki sam w dwóch kolejnych klatkach. Dopóki nie jest,
 * akcja idzie w pętlę ponowień i zjada budżet testu, aż zostanie przerwana komunikatem
 * „element is not stable". W kalkulatorze klirensu zbiegają się dwie przyczyny takiego ruchu:
 *
 *  1. PRZEWIJANIE JEST ANIMOWANE. `style.css` ustawia `html,body{scroll-behavior:smooth}`,
 *     więc każde przewinięcie — także to, którym Playwright sam sprowadza cel kliknięcia do
 *     widoku — rozkłada się na kilkadziesiąt klatek. Zmierzone (2026-09-20, desktop-chromium,
 *     jeden worker, maszyna bezczynna): `page.locator('#ktvToggle').check()` po samym
 *     `openCalculator` + trzech `fill` trwało 2677 ms, a ślad `scrollY` klatka po klatce
 *     pokazywał ciągły przejazd 0 → 10632 px. Ten sam `check()` poprzedzony bramką z tego
 *     modułu trwał 111 ms. Przy sześciu workerach klatki są rzadsze, a ponowienia dłuższe —
 *     wtedy 60-sekundowy budżet testu potrafi się skończyć w tej pętli.
 *     `page.emulateMedia({ reducedMotion: 'reduce' })' tego NIE wyłącza (zmierzone: 2702 ms),
 *     więc bramka musi sama ustawić element na miejscu — przewinięciem `behavior: 'instant'`,
 *     które unieważnia animację i sprawia, że Playwright nie ma już czego przewijać.
 *
 *  2. UKŁAD DOMYKA SIĘ PO BRAMKACH `openCalculator`. Strona dociąga arkusz Google Fonts
 *     linkiem `media="print" onload="this.media='all'"`, czyli CELOWO poza ścieżką renderu;
 *     plik fontu Inter przychodzi jeszcze później i podmienia krój (`display=swap`) w całym
 *     dokumencie. `openCalculator` czeka tylko na globalne funkcje kalkulatora, a te pochodzą
 *     ze skryptów `defer` — bywają gotowe, zanim font dojdzie. Zmierzone (2026-09-20,
 *     plik fontu opóźniony o 3 s przez `page.route`): zaraz po `openCalculator` strona miała
 *     `document.readyState === 'interactive'` i `document.fonts.status === 'loading'`, a
 *     2357 ms później przepływ przeskoczył — `#ktvToggle` z 10951 px na 10735 px, wysokość
 *     dokumentu z 13553 px na 13337 px. Kliknięcie w to okno trafia w ruchomy element.
 *
 * Bramki czekają na WARUNEK, nie na zegar: `waitForFunction` odpytywane co klatkę (domyślne
 * `polling: 'raf'`) liczy kolejne klatki o identycznym prostokącie — to ta sama definicja
 * stabilności, której używa sam Playwright, tylko postawiona PRZED akcją, a nie w jej budżecie.
 *
 * Predykaty są SYNCHRONICZNE — `waitForFunction` z predykatem oddającym `Promise` nie czeka
 * wcale (patrz tests/unit/straznik-bramek-testowych.test.mjs i tests/support/sejf-czekanie.mjs).
 *
 * Żadna z tych bramek nie zmienia stanu aplikacji poza pozycją przewinięcia i nie zastępuje
 * asercji: `check()` i `click()` nadal przechodzą pełną kontrolę „actionability" Playwrighta.
 */

const DOMYSLNY_TIMEOUT = 15000;

/** Ile kolejnych klatek prostokąt musi być identyczny. Playwright wymaga jednej; trzy dają zapas. */
const KLATKI = 3;

let kolejnyZnacznik = 0;

/** Czytelny błąd zamiast gołego „Timeout … exceeded" z waitForFunction. */
async function zBramka(opis, akcja) {
  try {
    await akcja();
  } catch (blad) {
    blad.message = `bramka układu (${opis}): ${blad.message}`;
    throw blad;
  }
}

/**
 * Czeka, aż strona domknie układ: wszystkie podzasoby są rozstrzygnięte
 * (`readyState === 'complete'` — to obejmuje odroczony arkusz Google Fonts), żaden font nie
 * jest w locie (`document.fonts.status === 'loaded'` — to obejmuje podmianę kroju), a przepływ
 * dokumentu nie drgnął przez kolejne klatki.
 *
 * Stawiać po `openCalculator`, zanim padnie pierwsze kliknięcie w teście.
 */
export async function czekajNaUstabilizowanyUklad(page, opcje = {}) {
  const klatki = opcje.klatki || KLATKI;
  const timeout = opcje.timeout || DOMYSLNY_TIMEOUT;
  await zBramka('strona nie domknęła układu', () => page.waitForFunction(
    ([ileKlatek, znacznik]) => {
      if (document.readyState !== 'complete') return false;
      if (document.fonts.status !== 'loaded') return false;
      // Próbki rozrzucone po przepływie dokumentu: każdy przeskok wyżej rusza je wszystkie.
      const pola = document.querySelectorAll('input, select, button');
      const czesci = [document.documentElement.scrollHeight, document.body.scrollHeight];
      if (pola.length) {
        for (const i of [0, pola.length >> 2, pola.length >> 1, pola.length - 1]) {
          const prostokat = pola[i].getBoundingClientRect();
          czesci.push(prostokat.top + window.scrollY, prostokat.height);
        }
      }
      const podpis = czesci.join('|');
      const stan = window.__vildaBramkaUkladu;
      if (!stan || stan.znacznik !== znacznik || stan.podpis !== podpis) {
        window.__vildaBramkaUkladu = { znacznik, podpis, klatki: 0 };
        return false;
      }
      stan.klatki += 1;
      return stan.klatki >= ileKlatek;
    },
    [klatki, `uklad-${(kolejnyZnacznik += 1)}`],
    { timeout },
  ));
}

/**
 * Ustawia element na swoim miejscu i czeka, aż tam zostanie.
 *
 * Najpierw przewija go na środek widoku BEZ animacji — to unieważnia trwający płynny przejazd
 * i zdejmuje z Playwrighta potrzebę przewijania w trakcie akcji. Potem czeka, aż prostokąt
 * elementu i pozycja przewinięcia będą identyczne przez kolejne klatki.
 */
export async function ustawNaMiejscu(locator, opcje = {}) {
  const klatki = opcje.klatki || KLATKI;
  const timeout = opcje.timeout || DOMYSLNY_TIMEOUT;
  const page = locator.page();
  const uchwyt = await locator.elementHandle({ timeout });
  if (!uchwyt) throw new Error(`bramka układu: brak elementu ${locator}`);
  try {
    await uchwyt.evaluate((element) => {
      element.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'instant' });
    });
    await zBramka(`element ${locator} nie przestał się przesuwać`, () => page.waitForFunction(
      ([element, ileKlatek, znacznik]) => {
        if (!element || !element.isConnected) return false;
        const prostokat = element.getBoundingClientRect();
        const podpis = [
          prostokat.top, prostokat.left, prostokat.width, prostokat.height,
          window.scrollX, window.scrollY,
        ].join('|');
        const stan = window.__vildaBramkaElementu;
        if (!stan || stan.znacznik !== znacznik || stan.podpis !== podpis) {
          window.__vildaBramkaElementu = { znacznik, podpis, klatki: 0 };
          return false;
        }
        stan.klatki += 1;
        return stan.klatki >= ileKlatek;
      },
      [uchwyt, klatki, `element-${(kolejnyZnacznik += 1)}`],
      { timeout },
    ));
  } finally {
    await uchwyt.dispose();
  }
}

/** `check()` poprzedzone bramką na ustawienie elementu. */
export async function zaznacz(locator, opcje = {}) {
  await ustawNaMiejscu(locator, opcje);
  await locator.check();
}

/** `click()` poprzedzone bramką na ustawienie elementu. */
export async function kliknij(locator, opcje = {}) {
  await ustawNaMiejscu(locator, opcje);
  await locator.click();
}
