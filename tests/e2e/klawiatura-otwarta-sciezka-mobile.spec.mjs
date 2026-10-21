import { expect, test } from '../support/test-czas.mjs';
import { otworzPowloke } from '../support/powloka-przewiniecie.mjs';

// P-KLAWIATURA-2 (zgłoszenie właściciela 2026-10-17, po scaleniu P-KLAWIATURA): na iPhonie w PWA
// ścieżka wiek (lata) → wiek (miesiące) → waga → wzrost, z klawiaturą otwartą CAŁY CZAS, nadal
// chowała wzrost pod klawiaturę. Test P-KLAWIATURA chował klawiaturę przed wagą, więc tej ścieżki
// nie sprawdzał.
//
// Chromium nie ma klawiatury iOS. Klawiaturę i zachowania iOS test UDAJE w oknie powłoki:
// visualViewport.height niższy o 336 px, visualViewport.offsetTop jako przesunięcie powłoki przez iOS,
// a w jednym wariancie innerHeight malejący razem z klawiaturą. Położenie pola „na ekranie” liczy
// się jak na iOS: góra ramki + pole w ramce − offsetTop. To emulacja założeń, nie pomiar iPhone'a;
// zachowanie prawdziwego iOS potwierdza kontrola na telefonie. Dane wyłącznie FIKCYJNE.
test.use({ serviceWorkers: 'block', viewport: { width: 393, height: 852 } });

const HASLO = 'E2e#KlawiaturaOtwarta!26';
const KLAWIATURA = 336;
const LINIA = 852 - KLAWIATURA;
// Margines nad klawiaturą z P-KLAWIATURA-2 (miejsce na pływający pasek iOS 26).
const MARGINES = 40;

async function wciecia(page, top, bottom) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setSafeAreaInsetsOverride', { insets: { top, bottom, left: 0, right: 0 } });
}

async function przygotuj(page) {
  await wciecia(page, 59, 34);
  const start = await otworzPowloke(page, HASLO);
  const zgoda = page.locator('#consent-decline');
  if (await zgoda.isVisible()) await zgoda.click();
  await expect(page.locator('#consent-banner')).toBeHidden();
  // Ramka na 1 px: ios26-ui.js (primeMobileBrowserUiChrome) przesuwa stronę stojącą na samej górze o 1 px.
  // To przygotowanie PO starcie, przed jakąkolwiek interakcją z klawiaturą. Pod obciążeniem
  // końcowe kotwiczenie układu zmieniało 1 → 2 px po 109 ms. Ponawiamy wyłącznie ustawienie
  // pozycji początkowej, aż pozostanie dokładnie na 1 px przez 200 ms i co najmniej 3 klatki.
  await start.evaluate(() => {
    window.__e2eKeyboardInitialScroll = { since: performance.now(), frames: 0 };
    window.scrollTo({ top: 1, left: 0, behavior: 'instant' });
  });
  await start.waitForFunction(() => {
    const probe = window.__e2eKeyboardInitialScroll;
    if (window.scrollY !== 1) {
      window.scrollTo({ top: 1, left: 0, behavior: 'instant' });
      probe.since = performance.now();
      probe.frames = 0;
      return false;
    }
    probe.frames += 1;
    return probe.frames >= 3 && performance.now() - probe.since >= 200;
  }, null, { timeout: 4000 });
  await expect.poll(() => start.evaluate(() => window.scrollY)).toBe(1);
  await start.evaluate(() => { delete window.__e2eKeyboardInitialScroll; });
  return start;
}

// Udawany iOS w oknie powłoki. `klawiatura` — wysokość klawiatury; `pan` — przesunięcie powłoki
// (visualViewport.offsetTop); `kurczyOkno` — innerHeight maleje razem z klawiaturą.
async function ios(page, stan) {
  await page.evaluate((s) => {
    const vv = window.visualViewport;
    if (!window.__iosE2e) {
      const st = { klawiatura: 0, pan: 0, kurczyOkno: false, pelne: window.innerHeight };
      Object.defineProperty(vv, 'height', { configurable: true, get: () => st.pelne - st.klawiatura });
      Object.defineProperty(vv, 'offsetTop', { configurable: true, get: () => st.pan });
      Object.defineProperty(window, 'innerHeight', { configurable: true, get: () => (st.kurczyOkno ? st.pelne - st.klawiatura : st.pelne) });
      window.__iosE2e = st;
    }
    const st = window.__iosE2e;
    const zmianaKlawiatury = 'klawiatura' in s && s.klawiatura !== st.klawiatura;
    const zmianaPrzesuniecia = 'pan' in s && s.pan !== st.pan;
    Object.assign(st, s);
    if (zmianaKlawiatury) vv.dispatchEvent(new Event('resize'));
    if (zmianaPrzesuniecia) vv.dispatchEvent(new Event('scroll'));
  }, stan);
}

// Pole tak, jak widzi je lekarz: we współrzędnych ekranu, z przesunięciem powłoki.
const pole = (page, start, id) => start.evaluate((idPola) => {
  const r = document.getElementById(idPola).getBoundingClientRect();
  const f = window.frameElement.getBoundingClientRect();
  const pan = window.parent.visualViewport.offsetTop || 0;
  return {
    top: Math.round(f.top + r.top - pan),
    bottom: Math.round(f.top + r.bottom - pan),
    ramkaY: Math.round(window.scrollY),
    x: Math.round(r.left + r.width / 2),
    yDotkniecia: Math.round(f.top + (r.top + r.bottom) / 2)
  };
}, id);

// Dotknięcie w miejscu, w którym Chromium rysuje pole (bez udawanego przesunięcia powłoki).
async function dotknij(page, start, id) {
  const p = await pole(page, start, id);
  await page.touchscreen.tap(p.x, p.yDotkniecia);
  await expect.poll(() => start.evaluate(() => document.activeElement && document.activeElement.id)).toBe(id);
}

const nadKlawiatura = (p) => p.bottom <= LINIA - MARGINES && p.top >= 150;

test('ścieżka właściciela: wiek (lata) → miesiące → waga → wzrost przy otwartej klawiaturze — pole i następny wiersz stoją nad klawiaturą', async ({ page }) => {
  test.setTimeout(150_000);
  const start = await przygotuj(page);
  const naglowek = await page.evaluate(() => Math.round(document.querySelector('header').getBoundingClientRect().top));

  // Wiek: klawiatura się wysuwa, pole leży wysoko — nic się nie rusza.
  const wiekPrzed = await pole(page, start, 'age');
  await dotknij(page, start, 'age');
  await ios(page, { klawiatura: KLAWIATURA });
  await page.waitForTimeout(1000); // także kontrole po 350 i 900 ms
  const wiek = await pole(page, start, 'age');
  expect(wiek, 'wiek bez przewijania').toEqual(wiekPrzed);
  expect(nadKlawiatura(wiek)).toBe(true);
  await page.keyboard.type('9');

  // Miesiące w tym samym wierszu, klawiatura zostaje.
  await dotknij(page, start, 'ageMonths');
  await page.waitForTimeout(400);
  expect((await pole(page, start, 'ageMonths')).ramkaY).toBe(wiek.ramkaY);
  await page.keyboard.type('3');

  // Waga leży pod klawiaturą (645–688 px). Dotknięcie przy otwartej klawiaturze stawia ją nad nią,
  // a wiersz wzrostu pod nią też jest nad klawiaturą z marginesem — wersja 1 zostawiała wzrost 39 px nad
  // linią visualViewport, czyli pod pływającym paskiem iOS 26.
  expect((await pole(page, start, 'weight')).bottom, 'bez modułu waga byłaby pod klawiaturą').toBeGreaterThan(LINIA);
  await dotknij(page, start, 'weight');
  await page.waitForTimeout(1000);
  const waga = await pole(page, start, 'weight');
  const wzrostPoWadze = await pole(page, start, 'height');
  expect(nadKlawiatura(waga), JSON.stringify(waga)).toBe(true);
  expect(nadKlawiatura(wzrostPoWadze), 'wzrost widoczny po wadze: ' + JSON.stringify(wzrostPoWadze)).toBe(true);
  await page.keyboard.type('40');

  // Wzrost: dotknięcie niczego nie przesuwa, także po kontrolach.
  await dotknij(page, start, 'height');
  await page.waitForTimeout(1000);
  expect(await pole(page, start, 'height')).toEqual(wzrostPoWadze);

  // Wyniki pod formularzem niczego nie przesuwają.
  await page.keyboard.type('135');
  await expect(start.locator('#bmiResult .result-number')).toBeVisible({ timeout: 15000 });
  await page.waitForTimeout(400);
  expect(await pole(page, start, 'height')).toEqual(wzrostPoWadze);
  expect(await page.evaluate(() => Math.round(document.querySelector('header').getBoundingClientRect().top)), 'nagłówek na miejscu').toBe(naglowek);
  expect(await page.evaluate(() => window.scrollY), 'powłoka nieprzesunięta').toBe(0);
  expect(await start.evaluate(() => ['age', 'ageMonths', 'weight', 'height'].map((id) => document.getElementById(id).value))).toEqual(['9', '3', '40', '135']);
  // Diagnostyka jest wyłączona domyślnie.
  expect(await page.locator('#vildaKlawiaturaDiag').count()).toBe(0);
});

// Zaburzenie 100 ms po fokusie pola, liczone w samej stronie — niezależnie od opóźnień Playwrighta
// pod obciążeniem. Zapisuje położenie pola na ekranie tuż po zaburzeniu (przed kontrolą modułu).
async function poFokusie(start, id, rodzaj) {
  await start.evaluate(([idPola, r]) => {
    const el = document.getElementById(idPola);
    el.addEventListener('focus', () => {
      setTimeout(() => {
        if (r === 'cofnij-przesuniecie-powloki') {
          window.parent.__iosE2e.pan = 0;
          window.parent.visualViewport.dispatchEvent(new Event('scroll'));
        } else {
          window.scrollTo({ top: window.scrollY - 250, behavior: 'instant' });
        }
        const b = el.getBoundingClientRect();
        window.__poZaburzeniu = Math.round(window.frameElement.getBoundingClientRect().top + b.bottom - (window.parent.visualViewport.offsetTop || 0));
      }, 100);
    }, { once: true });
  }, [id, rodzaj]);
}

test('iOS cofa przesunięcie powłoki po dotknięciu wzrostu: kontrola podnosi pole spod klawiatury', async ({ page }) => {
  test.setTimeout(150_000);
  const start = await przygotuj(page);
  await dotknij(page, start, 'age');
  await ios(page, { klawiatura: KLAWIATURA });
  await page.keyboard.type('9');

  // iOS odsłania wagę, przesuwając całą powłokę o 200 px; moduł liczy pas z tym przesunięciem.
  await ios(page, { pan: 200 });
  await dotknij(page, start, 'weight');
  await page.waitForTimeout(400);
  const waga = await pole(page, start, 'weight');
  expect(nadKlawiatura(waga), JSON.stringify(waga)).toBe(true);
  expect(nadKlawiatura(await pole(page, start, 'height'))).toBe(true);
  await page.keyboard.type('40');

  // Zaraz po dotknięciu wzrostu przesunięcie powłoki znika (cofnięte przez iOS albo przez powłokę).
  // Bez kontroli wzrost zostaje 200 px niżej — pod klawiaturą, tak jak zgłosił właściciel.
  await poFokusie(start, 'height', 'cofnij-przesuniecie-powloki');
  await dotknij(page, start, 'height');
  await expect.poll(() => start.evaluate(() => window.__poZaburzeniu)).toBeGreaterThan(LINIA);
  await expect.poll(async () => nadKlawiatura(await pole(page, start, 'height')), { timeout: 3000 }).toBe(true);
  await page.keyboard.type('135');
  await expect(start.locator('#bmiResult .result-number')).toBeVisible({ timeout: 15000 });
  expect(nadKlawiatura(await pole(page, start, 'height'))).toBe(true);
});

test('coś przewija ramkę zaraz po fokusie: kontrola podnosi pole; po 1,5 s przewinięcie należy do lekarza', async ({ page }) => {
  test.setTimeout(150_000);
  const start = await przygotuj(page);
  await dotknij(page, start, 'age');
  await ios(page, { klawiatura: KLAWIATURA });
  await dotknij(page, start, 'weight');
  await page.waitForTimeout(400);

  // Ramka cofnięta o 250 px 100 ms po fokusie wzrostu (np. kotwiczenie przewijania albo odsłanianie pola przez WebKit).
  await poFokusie(start, 'height', 'cofnij-ramke');
  await dotknij(page, start, 'height');
  await expect.poll(() => start.evaluate(() => window.__poZaburzeniu)).toBeGreaterThan(LINIA);
  await expect.poll(async () => nadKlawiatura(await pole(page, start, 'height')), { timeout: 3000 }).toBe(true);

  // Po oknie kontroli przewinięcie palcem zostaje, nawet jeśli chowa pole.
  await page.waitForTimeout(1600);
  await start.evaluate(() => window.scrollTo({ top: window.scrollY - 250, behavior: 'instant' }));
  const palcem = await pole(page, start, 'height');
  await page.waitForTimeout(1200);
  expect(await pole(page, start, 'height')).toEqual(palcem);

  // Kontrola tylko podnosi: pole przewinięte wyżej (ale widoczne) zostaje tam, gdzie je zostawiono.
  await dotknij(page, start, 'weight');
  await start.evaluate(() => window.scrollTo({ top: window.scrollY + 60, behavior: 'instant' }));
  const wyzej = await pole(page, start, 'weight');
  await page.waitForTimeout(1200);
  expect(await pole(page, start, 'weight')).toEqual(wyzej);
});

test('innerHeight powłoki maleje razem z klawiaturą: moduł nadal widzi klawiaturę, a powłoka nie cofa przesunięcia', async ({ page }) => {
  test.setTimeout(150_000);
  const start = await przygotuj(page);
  await ios(page, { kurczyOkno: true });
  await dotknij(page, start, 'age');
  await ios(page, { klawiatura: KLAWIATURA });
  expect(await page.evaluate(() => [window.innerHeight, Math.round(window.visualViewport.height)])).toEqual([LINIA, LINIA]);

  // Waga staje tak samo jak przy stałym innerHeight: dolna krawędź na linii − 40 − 96 (zapas na wzrost).
  // Bez wysokości bazowej moduł uznałby klawiaturę za schowaną i liczył pas z szacunku.
  await dotknij(page, start, 'weight');
  await page.waitForTimeout(400);
  const waga = await pole(page, start, 'weight');
  expect(waga.bottom).toBeGreaterThanOrEqual(LINIA - MARGINES - 96 - 2);
  expect(waga.bottom).toBeLessThanOrEqual(LINIA - MARGINES - 96 + 2);
  expect(nadKlawiatura(await pole(page, start, 'height'))).toBe(true);

  // Powłoka: przesunięcie przy otwartej klawiaturze zostaje (J() cofa je dopiero po schowaniu klawiatury).
  // Dokument powłoki nie ma czego przewijać, więc test dokłada mu na chwilę wysokości.
  await page.evaluate(() => {
    const d = document.createElement('div');
    d.id = '__e2eWyzej';
    d.style.height = '400px';
    document.body.appendChild(d);
    window.scrollTo({ top: 40, behavior: 'instant' });
  });
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(40);
  await page.waitForTimeout(500);
  expect(await page.evaluate(() => window.scrollY), 'St() widzi klawiaturę mimo malejącego innerHeight').toBe(40);

  // Po schowaniu klawiatury i wyjściu z pola powłoka wraca na miejsce jak dotąd.
  await start.evaluate(() => document.activeElement.blur());
  await ios(page, { klawiatura: 0 });
  await expect.poll(() => page.evaluate(() => window.scrollY), { timeout: 3000 }).toBe(0);
  await page.evaluate(() => document.getElementById('__e2eWyzej').remove());
});

test('dziennik diagnostyczny: klucz vilda-dockdiag pokazuje pomiary i decyzje modułu w powłoce', async ({ page }) => {
  test.setTimeout(150_000);
  const start = await przygotuj(page);
  await page.evaluate(() => window.localStorage.setItem('vilda-dockdiag', '1'));
  await dotknij(page, start, 'age');
  await ios(page, { klawiatura: KLAWIATURA });
  await dotknij(page, start, 'weight');
  const panel = page.locator('#vildaKlawiaturaDiag');
  await expect(panel).toContainText('KLAWIATURA v2');
  await expect(panel).toContainText(/weight fokus inH852\/852 vv516@0 .* dy\d+/);
  expect(await panel.evaluate((n) => getComputedStyle(n).pointerEvents)).toBe('none');

  // Wyłączenie: następny fokus zdejmuje panel.
  await page.evaluate(() => window.localStorage.setItem('vilda-dockdiag', '0'));
  await dotknij(page, start, 'height');
  await expect(panel).toHaveCount(0);
});
