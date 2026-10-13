import { expect, test } from '../support/test-czas.mjs';
import { spozaWindows1250 } from '../support/windows1250.mjs';

// P-IOS-SCHOWEK na PRAWDZIWEJ stronie i PRAWDZIWYM schowku systemowym.
//
// Zgłoszenie z iOS (2026-09-16): treść skopiowana przyciskiem „Podsumowanie wyników" wklejała się
// w Notatkach i Wiadomościach JAKO ŁĄCZA, choć w polu przyjmującym czysty tekst ta sama zawartość
// była poprawna, a inne przyciski aplikacji działały. Przyczyna: na schowku iOS leżą obok siebie
// różne warianty tej samej treści — `writeText` zapisuje wyłącznie czysty tekst, a `execCommand`
// z pola `contentEditable` dokłada wariant HTML, który Notatki wolą od tekstu.
//
// UWAGA CO DO ZAKRESU: to Chromium, nie WebKit — ten plik NIE dowodzi zachowania na iPhonie.
// Dowodzi tego, co da się sprawdzić bez tamtej platformy: że tekst ląduje w systemowym schowku
// i że przy dostępnym Clipboard API druga droga zapisu w ogóle nie rusza. Dane FIKCYJNE.
//
// P-SCHOWEK-HIS (zgłoszenie właściciela, 2026-10-13): w Eskulapie (HIS) „≥" z podsumowania
// zamieniał się w wydruku PDF i na P1 w „?", a tekst zaczynał się od „?". Tekst w schowku mieści
// się odtąd w stronie kodowej Windows-1250, a łącznik U+2060 dostaje tylko iPhone i iPad.
// Wyrocznią repertuaru jest dekoder Windows-1250 z Node, nie tabela modułu.
test.use({ serviceWorkers: 'block', permissions: ['clipboard-read', 'clipboard-write'] });

const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 '
  + '(KHTML, like Gecko) Version/18.6 Mobile/15E148 Safari/604.1';


const ZNACZNIK = 'POPRZEDNIA-ZAWARTOSC-SCHOWKA-1234';
const HASLO = 'E2e#Schowek!26a';

async function otworz(page, { bezApiSchowka = false, zepsuteZaznaczenie = false, podgladExec = false } = {}) {
  await page.addInitScript(() => {
    try {
      window.localStorage.setItem('vilda-terms-accepted-v1',
        JSON.stringify({ version: 1, acceptedAtISO: new Date().toISOString() }));
    } catch (_) { /* brak storage — pomiń */ }
  });
  if (podgladExec) {
    await page.addInitScript(() => {
      window.__execCopy = 0;
      const orig = document.execCommand ? document.execCommand.bind(document) : null;
      document.execCommand = function (cmd) {
        if (cmd === 'copy') window.__execCopy += 1;
        return orig ? orig(cmd) : false;
      };
    });
  }
  if (bezApiSchowka) {
    // Tak wygląda świat, w którym zostaje wyłącznie ścieżka synchroniczna — czyli ta,
    // która na iOS była zepsuta.
    await page.addInitScript(() => {
      try { Object.defineProperty(navigator, 'clipboard', { value: undefined, configurable: true }); } catch (_) { /* nie da się podmienić */ }
    });
  }
  if (zepsuteZaznaczenie) {
    // Model awarii z iOS: przeglądarka MÓWI, że skopiowała, ale zaznaczenie nie powstało.
    await page.addInitScript(() => {
      try {
        HTMLTextAreaElement.prototype.setSelectionRange = function () { /* iOS bez contentEditable */ };
        document.execCommand = () => true;
      } catch (_) { /* nie da się podmienić */ }
    });
  }
  await page.goto('/index.html', { waitUntil: 'load' });
  // Bez odblokowanego sejfu cała treść strony stoi na `visibility:hidden` — przycisk istnieje,
  // ale nie da się go kliknąć. Konto zakładamy jak w pozostałych testach e2e, dane FIKCYJNE.
  await page.waitForFunction(() => Boolean(window.VildaVault));
  await page.evaluate(async (pw) => window.VildaVault.createUser(pw, { label: 'e2e', iterations: 10000 }), HASLO);
  await page.reload({ waitUntil: 'load' });
  await page.waitForFunction(() => Boolean(window.VildaVault) && window.VildaVault.isUnlocked());
  await page.waitForFunction(() => !document.documentElement.classList.contains('vilda-auth-locked'));
  await page.waitForFunction(() => typeof window.update === 'function' && Boolean(window.VildaBmi));
  await page.waitForFunction(() => Boolean(window.VildaSchowek));
}

async function wlaczTrybPro(page) {
  // Przycisk podsumowania pokazuje się dopiero w trybie profesjonalnym — włączamy go
  // prawdziwym przełącznikiem, jak lekarz. Ponawiamy, aż zadziała: zaraz po wczytaniu strony
  // nasłuch przełącznika bywa jeszcze niepodpięty i pojedyncze kliknięcie przepada.
  await page.waitForFunction(() => {
    const pro = document.getElementById('resultsModeToggle');
    if (!pro) return false;
    if (!pro.checked) { pro.checked = true; pro.dispatchEvent(new Event('change', { bubbles: true })); }
    return window.professionalMode === true;
  }, { timeout: 15000 });
}

async function wpiszPacjenta(page) {
  await wlaczTrybPro(page);
  await page.evaluate(() => {
    const set = (id, v) => {
      const el = document.getElementById(id);
      if (!el) return;
      el.value = String(v);
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    };
    set('age', 9); set('ageMonths', 3); set('sex', 'M'); set('weight', 28); set('height', 123.8);
    window.update();
  });
  await expect(page.locator('#metabolicSummaryBtn')).toBeVisible({ timeout: 15000 });
}

/* Czyta schowek SYSTEMOWY przez wklejenie z klawiatury — celowo nie przez `navigator.clipboard`,
   bo to właśnie jest API badane w tym teście. */
async function wklejZeSchowka(page) {
  await page.evaluate(() => {
    let pole = document.getElementById('__testPaste');
    if (!pole) {
      pole = document.createElement('textarea');
      pole.id = '__testPaste';
      pole.style.cssText = 'position:fixed;bottom:0;left:0;width:200px;height:60px;z-index:99999;';
      document.body.appendChild(pole);
    }
    pole.value = '';
    pole.focus();
  });
  await page.keyboard.press('ControlOrMeta+V');
  return page.evaluate(() => document.getElementById('__testPaste').value);
}

async function zasiejZnacznik(page, znacznik) {
  await page.evaluate(async (z) => { await navigator.clipboard.writeText(z); }, znacznik);
}

test('tekst ląduje w SYSTEMOWYM schowku, a druga droga zapisu nie rusza', async ({ page }) => {
  await otworz(page, { podgladExec: true });
  await wpiszPacjenta(page);
  await zasiejZnacznik(page, ZNACZNIK);

  await page.locator('#metabolicSummaryBtn').click();
  await expect(page.locator('#vildaDymek')).toBeVisible({ timeout: 10000 });

  // istota naprawy: skoro Clipboard API jest dostępne, execCommand NIE ma prawa się uruchomić
  // — inaczej dołożyłby na schowek wariant HTML, przez który Notatki wklejają łącza
  // najpierw upewniamy się, że podgląd w ogóle stoi — inaczej zero poniżej nic nie znaczy
  expect(await page.evaluate(() => typeof window.__execCopy), 'podgląd execCommand zainstalowany').toBe('number');
  expect(await page.evaluate(() => window.__execCopy), 'żadnego execCommand obok writeText').toBe(0);

  const wklejone = await wklejZeSchowka(page);
  expect(wklejone, 'schowek nie może zostać z poprzednią zawartością').not.toContain(ZNACZNIK);
  // P-SCHOWEK-HIS: na komputerze BEZ łącznika U+2060 — w HIS-ie pod Windows wracał jako „?" przed
  // pierwszym wierszem. Łącznik zostaje tylko na iPhonie i iPadzie (osobny test niżej).
  expect(wklejone.charCodeAt(0), 'pierwszy znak to litera etykiety, nie łącznik U+2060').toBe('W'.charCodeAt(0));
  expect(wklejone, 'od razu właściwa treść').toMatch(/^Waga:/);
  expect(spozaWindows1250(wklejone), 'każdy znak przeżyje stronę kodową Windows-1250').toEqual([]);
  expect(wklejone).toContain('BMI:');
  expect(wklejone).toContain('Waga:');
  expect(wklejone).toContain('Wzrost:');
});

test('bez Clipboard API rusza ścieżka zapasowa — i wtedy podgląd faktycznie ją widzi', async ({ page }) => {
  await otworz(page, { bezApiSchowka: true, podgladExec: true });
  await wpiszPacjenta(page);
  const brakApi = await page.evaluate(() => !navigator.clipboard);
  test.skip(!brakApi, 'nie udało się wyłączyć navigator.clipboard w tej przeglądarce');

  await page.locator('#metabolicSummaryBtn').click();
  await expect(page.locator('#vildaDymek')).toBeVisible({ timeout: 10000 });

  // kontrola DODATNIA dla testu wyżej: ten sam podgląd tutaj liczy wywołania, więc zero
  // w tamtym teście jest wynikiem pomiaru, a nie niedziałającego podglądu
  expect(await page.evaluate(() => window.__execCopy), 'tu droga zapasowa musi ruszyć').toBeGreaterThan(0);

  const wklejone = await wklejZeSchowka(page);
  expect(wklejone, 'sam execCommand musi wystarczyć').toContain('BMI:');
});

test('gdy kopiowanie się nie uda, przycisk mówi prawdę zamiast pokazywać „skopiowane"', async ({ page }) => {
  await otworz(page, { bezApiSchowka: true, zepsuteZaznaczenie: true });
  await wpiszPacjenta(page);
  await zasiejZnacznik(page, ZNACZNIK).catch(() => { /* API wyłączone — znacznik zasiewamy niżej */ });

  const komunikaty = [];
  page.on('dialog', (d) => { komunikaty.push(d.message()); d.dismiss().catch(() => {}); });

  await page.locator('#metabolicSummaryBtn').click();
  await page.waitForTimeout(1500);

  expect(komunikaty.join(' '), 'lekarz musi wiedzieć, że schowek został bez zmian').toMatch(/nie uda/i);
  await expect(page.locator('#vildaDymek'), 'żadnego fałszywego „skopiowane"').toHaveCount(0);
});

test.describe('na iPhonie (identyfikator przeglądarki iPhone’a)', () => {
  test.use({ userAgent: IPHONE });

  test('łącznik U+2060 zostaje przed „Waga:" — poprawka P-IOS-SCHOWEK działa dalej', async ({ page }) => {
    // Chromium z identyfikatorem iPhone’a: sprawdza decyzję modułu „czy to iOS", nie WebKit.
    await otworz(page);
    expect(await page.evaluate(() => navigator.userAgent), 'kontrola: strona widzi iPhone’a').toContain('iPhone');
    await wpiszPacjenta(page);
    await zasiejZnacznik(page, ZNACZNIK);

    await page.locator('#metabolicSummaryBtn').click();
    await expect(page.locator('#vildaDymek')).toBeVisible({ timeout: 10000 });

    const wklejone = await wklejZeSchowka(page);
    expect(wklejone, 'schowek nie może zostać z poprzednią zawartością').not.toContain(ZNACZNIK);
    // potwierdzone na iPhonie: bez tego znaku tekst zaczyna się od „Waga:", co WebKit czyta jako
    // schemat adresu i Notatki wklejają CAŁOŚĆ jako jedno łącze
    expect(wklejone.charCodeAt(0), 'na początku łącznik wyrazów U+2060').toBe(0x2060);
    expect(wklejone.slice(1), 'zaraz za nim właściwa treść').toMatch(/^Waga:/);
    expect(spozaWindows1250(wklejone.slice(1)), 'reszta w Windows-1250 jak na komputerze').toEqual([]);
  });
});

test('P-SCHOWEK-HIS: norma tempa wzrastania trafia do schowka słownie („co najmniej"), a karta dalej pokazuje „≥"', async ({ page }) => {
  // Chłopiec 12;6, 146 cm, 36 kg; rok wcześniej 140 cm, 33 kg; wiek kostny 11,5 roku; rodzice
  // 164 i 178 cm. Dane FIKCYJNE. Tempo 6,0 cm/rok z normą okołopokwitaniową „≥4 cm/rok" i ujemne SDS
  // („−") — dokładnie te znaki, które w zgłoszeniu wracały z HIS-u jako „?".
  await otworz(page);
  await wlaczTrybPro(page);
  await page.evaluate(() => {
    const set = (id, v) => {
      const el = document.getElementById(id);
      if (!el) return;
      el.value = String(v);
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    };
    set('sex', 'M'); set('age', 12); set('ageMonths', 6); set('height', 146); set('weight', 36);
    window.update();
  });
  // Karta zaawansowana podpina przycisk leniwie — czekamy na znacznik, który stawia sama aplikacja.
  await page.waitForSelector('#toggleAdvancedGrowth[data-vilda-advanced-growth-toggle-attached="true"]',
    { state: 'attached' });
  await page.locator('#toggleAdvancedGrowth').click();
  await page.waitForSelector('#advMeasurements .measure-row');
  await page.evaluate(() => {
    const wiersz = document.querySelector('#advMeasurements .measure-row');
    const wpisz = (sel, v) => {
      const e = wiersz.querySelector(sel);
      if (e) { e.value = String(v); e.dispatchEvent(new Event('input', { bubbles: true })); }
    };
    wpisz('.adv-age-years', 11); wpisz('.adv-age-months', 6); wpisz('.adv-height', 140); wpisz('.adv-weight', 33);
    const set = (id, v) => {
      const el = document.getElementById(id);
      if (!el) return;
      el.value = String(v);
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    };
    set('advMotherHeight', 164); set('advFatherHeight', 178); set('advBoneAge', 11.5);
    if (typeof window.calculateGrowthAdvanced === 'function') window.calculateGrowthAdvanced();
    window.update();
  });
  const karta = page.locator('#currentSummaryContent');
  // kontrola dodatnia: karta na ekranie ma „≥" — bez tego asercje schowka niżej niczego by nie dowodziły
  await expect(karta).toContainText(/norma \u2265\d/, { timeout: 15000 });
  await expect(page.locator('#metabolicSummaryBtn')).toBeVisible({ timeout: 15000 });
  await zasiejZnacznik(page, ZNACZNIK);

  await page.locator('#metabolicSummaryBtn').click();
  await expect(page.locator('#vildaDymek')).toBeVisible({ timeout: 10000 });
  const wklejone = await wklejZeSchowka(page);

  expect(wklejone, 'schowek nie może zostać z poprzednią zawartością').not.toContain(ZNACZNIK);
  // P-SCHOWEK-HIS-2 (decyzja właściciela 2026-10-13): słownie, nie „>="
  expect(wklejone, 'norma tempa zapisana słownie').toMatch(/Tempo wzrastania: [^\n]*norma co najmniej \d/);
  expect(wklejone, 'żadnego „≥", które HIS zamienia w „?"').not.toContain('\u2265');
  expect(wklejone, 'ujemne SDS ze zwykłym minusem').toMatch(/hSDS -\d/);
  expect(spozaWindows1250(wklejone), 'każdy znak przeżyje stronę kodową Windows-1250').toEqual([]);
  // ekran bez zmian: karta nadal pokazuje „≥" i „−" po skopiowaniu
  await expect(karta).toContainText(/norma \u2265\d/);
  await expect(karta).toContainText(/hSDS \u2212\d/);
});
