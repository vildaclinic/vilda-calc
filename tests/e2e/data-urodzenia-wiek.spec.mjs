import { expect, test } from '@playwright/test';

// DOB-AGE-1 — pole „Data urodzenia" na PRAWDZIWEJ stronie: wpisana data wypełnia wiek
// w latach i miesiącach, blokuje te pola i trafia do rekordu przez kolektor.
//
// Formularz jest zasłonięty bramką logowania (`html.vilda-auth-locked` chowa całe body),
// a sejfa nie wolno odblokowywać (AGENTS.md §4), więc — jak pozostałe testy e2e tej
// aplikacji — sterujemy polami przez DOM i sprawdzamy stan DOM, nie widoczność.
// Dane FIKCYJNE; oczekiwany wiek liczony osobno, żeby test nie starzał się z kalendarzem.

async function otworz(page) {
  await page.goto('/index.html', { waitUntil: 'load' });
  await page.waitForFunction(
    () => Boolean(window.VildaDobAge) && typeof window.collectUserData === 'function'
  );
}

/* Wpisuje wartość tak, jak zrobiłby to lekarz: wartość + zdarzenia pola. */
function wpisz(page, id, wartosc, zdarzenia = ['input']) {
  return page.evaluate(
    ({ id: i, wartosc: v, zdarzenia: z }) => {
      const el = document.getElementById(i);
      if (!el) throw new Error('brak pola ' + i);
      el.value = v;
      z.forEach((nazwa) => el.dispatchEvent(new Event(nazwa, { bubbles: true })));
      return el.value;
    },
    { id, wartosc, zdarzenia }
  );
}

function stan(page) {
  return page.evaluate(() => {
    const q = (id) => document.getElementById(id);
    const widoczny = (el) => !!(el && !el.hidden);
    return {
      dob: q('dobInput').value,
      dobReadOnly: q('dobInput').readOnly,
      age: q('age').value,
      ageReadOnly: q('age').readOnly,
      ageMonths: q('ageMonths').value,
      ageMonthsReadOnly: q('ageMonths').readOnly,
      ageAuto: q('age').classList.contains('vild-age-auto'),
      notka: widoczny(q('dobNote')) ? q('dobNote').textContent : '',
      blad: widoczny(q('dobError')) ? q('dobError').textContent : '',
      czyscWidoczny: widoczny(q('dobClear')),
      tygodnieWiersz: widoczny(q('ageWeeksRow')),
      tygodnie: q('ageWeeks') ? q('ageWeeks').value : null,
      tygodnieReadOnly: q('ageWeeks') ? q('ageWeeks').readOnly : null,
      tygodnieNotka: widoczny(q('ageWeeksNote')) ? q('ageWeeksNote').textContent : '',
      tygodnieBlad: widoczny(q('ageWeeksError')) ? q('ageWeeksError').textContent : ''
    };
  });
}

/* Data urodzenia sprzed zadanej liczby dni — żeby test nie starzał się z kalendarzem. */
function dataSprzedDni(dni) {
  const d = new Date();
  d.setDate(d.getDate() - dni);
  const p = (n) => (n < 10 ? '0' + n : String(n));
  return p(d.getDate()) + '-' + p(d.getMonth() + 1) + '-' + d.getFullYear();
}

/* Ukończone pełne miesiące — liczone niezależnie od modułu, żeby test sprawdzał wynik, nie kopię wzoru. */
function oczekiwanyWiek(dobISO, dzis = new Date()) {
  const [r, m, d] = dobISO.split('-').map(Number);
  const ur = new Date(r, m - 1, d);
  const dz = new Date(dzis.getFullYear(), dzis.getMonth(), dzis.getDate());
  let lata = dz.getFullYear() - ur.getFullYear();
  let mies = dz.getMonth() - ur.getMonth();
  if (dz.getDate() - ur.getDate() < 0) mies -= 1;
  if (mies < 0) { lata -= 1; mies += 12; }
  return { lata, mies };
}

test('wpisana data wypełnia wiek, blokuje pola i pokazuje notkę', async ({ page }) => {
  test.setTimeout(120_000);
  await otworz(page);

  await wpisz(page, 'dobInput', '11.04/2025');
  const s = await stan(page);
  const { lata, mies } = oczekiwanyWiek('2025-04-11');

  expect(s.age).toBe(String(lata));
  expect(s.ageMonths).toBe(String(mies));
  expect(s.ageReadOnly).toBe(true);
  expect(s.ageMonthsReadOnly).toBe(true);
  expect(s.ageAuto).toBe(true);
  expect(s.notka).toContain('Wiek liczony z daty urodzenia');
  expect(s.blad).toBe('');
  expect(s.czyscWidoczny).toBe(true);
});

test('po opuszczeniu pola zapis normalizuje się do DD-MM-RRRR', async ({ page }) => {
  test.setTimeout(120_000);
  await otworz(page);

  await wpisz(page, 'dobInput', '20082019', ['input', 'change']);
  expect((await stan(page)).dob).toBe('20-08-2019');

  await wpisz(page, 'dobInput', '2019-08-20', ['input', 'change']);
  expect((await stan(page)).dob).toBe('20-08-2019');

  await wpisz(page, 'dobInput', '20 08 2019', ['input', 'change']);
  expect((await stan(page)).dob).toBe('20-08-2019');
});

test('zły zapis daje komunikat i NIE blokuje pól wieku', async ({ page }) => {
  test.setTimeout(120_000);
  await otworz(page);

  await wpisz(page, 'dobInput', '31-02-2020');
  let s = await stan(page);
  expect(s.blad).toContain('kalendarzu');
  expect(s.notka).toBe('');
  expect(s.ageReadOnly).toBe(false);

  await wpisz(page, 'dobInput', '01-01-2099');
  s = await stan(page);
  expect(s.blad).toContain('przyszłości');
  expect(s.ageReadOnly).toBe(false);

  await wpisz(page, 'dobInput', '20-08-19');
  s = await stan(page);
  expect(s.blad).toContain('czterocyfrowy');
  expect(s.ageReadOnly).toBe(false);
});

test('„Wyczyść datę" oddaje pola wieku do ręcznego wpisu, bez pytania', async ({ page }) => {
  test.setTimeout(120_000);
  await otworz(page);

  await wpisz(page, 'dobInput', '20-08-2019');
  expect((await stan(page)).ageReadOnly).toBe(true);

  const pytano = await page.evaluate(() => {
    let pytania = 0;
    const stary = window.confirm;
    window.confirm = () => { pytania += 1; return true; };
    document.getElementById('dobClear').click();
    window.confirm = stary;
    return pytania;
  });
  expect(pytano).toBe(0);

  const s = await stan(page);
  expect(s.dob).toBe('');
  expect(s.notka).toBe('');
  expect(s.czyscWidoczny).toBe(false);
  expect(s.ageReadOnly).toBe(false);
  expect(s.ageMonthsReadOnly).toBe(false);
  expect(s.ageAuto).toBe(false);

  // ostatnia wyliczona wartość zostaje i da się ją nadpisać ręcznie
  await wpisz(page, 'age', '9');
  expect((await stan(page)).age).toBe('9');
});

test('bez daty formularz działa jak dotąd — wiek wpisuje się ręcznie', async ({ page }) => {
  test.setTimeout(120_000);
  await otworz(page);

  const start = await stan(page);
  expect(start.notka).toBe('');
  expect(start.blad).toBe('');
  expect(start.ageReadOnly).toBe(false);

  await wpisz(page, 'age', '8');
  await wpisz(page, 'ageMonths', '4');

  const zebrane = await page.evaluate(() => window.collectUserData());
  expect(zebrane.user.dobISO).toBeUndefined();
  expect(zebrane.user.age).toBe(8);
  expect(zebrane.user.ageMonths).toBe(4);
});

test('data urodzenia trafia do rekordu razem z policzonym wiekiem', async ({ page }) => {
  test.setTimeout(120_000);
  await otworz(page);

  await wpisz(page, 'dobInput', '20-08-2019');
  await wpisz(page, 'height', '120');
  await wpisz(page, 'weight', '25');

  const { lata, mies } = oczekiwanyWiek('2019-08-20');
  const zebrane = await page.evaluate(() => window.collectUserData());
  expect(zebrane.user.dobISO).toBe('2019-08-20');
  expect(zebrane.user.age).toBe(lata);
  expect(zebrane.user.ageMonths).toBe(mies);
});

test('miesiące przyjmują 0 — wiek z daty urodzenia regularnie je produkuje', async ({ page }) => {
  test.setTimeout(120_000);
  await otworz(page);

  const wynik = await page.evaluate(() => {
    const el = document.getElementById('ageMonths');
    el.value = '0';
    el.dispatchEvent(new Event('input', { bubbles: true }));
    return { min: el.getAttribute('min'), poprawne: el.checkValidity(), wartosc: el.value };
  });
  expect(wynik.min).toBe('0');
  expect(wynik.poprawne).toBe(true);
  expect(wynik.wartosc).toBe('0');
});

test('data z wczytanego rekordu jest tylko do odczytu, z odesłaniem do Karty Pacjenta', async ({ page }) => {
  test.setTimeout(120_000);
  await otworz(page);

  await page.evaluate(() => {
    window.lastLoadedData = { user: { dobISO: '2012-02-03', sex: 'F' } };
    document.dispatchEvent(new Event('vilda:patient-loaded'));
  });
  await page.waitForFunction(() => document.getElementById('dobInput').value !== '');

  const s = await stan(page);
  const { lata, mies } = oczekiwanyWiek('2012-02-03');

  expect(s.dob).toBe('03-02-2012');
  expect(s.dobReadOnly).toBe(true);
  expect(s.notka).toContain('Karcie Pacjenta');
  expect(s.czyscWidoczny).toBe(false);
  expect(s.age).toBe(String(lata));
  expect(s.ageMonths).toBe(String(mies));
});

test('niemowlę z datą urodzenia dostaje tygodnie liczone z kalendarza', async ({ page }) => {
  test.setTimeout(120_000);
  await otworz(page);

  await wpisz(page, 'dobInput', dataSprzedDni(61)); // 61 dni = 8 ukończonych tygodni
  const s = await stan(page);

  expect(s.tygodnieWiersz).toBe(true);
  expect(s.tygodnie).toBe('8');
  expect(s.tygodnieReadOnly).toBe(true);
  expect(s.tygodnieNotka).toContain('8 tygodni');
  expect(s.tygodnieNotka).toContain('z daty urodzenia');
  expect(s.age).toBe('0');
  expect(s.ageMonths).toBe('1');
});

test('powyżej 3. miesiąca wiersz tygodni znika', async ({ page }) => {
  test.setTimeout(120_000);
  await otworz(page);

  await wpisz(page, 'dobInput', dataSprzedDni(200));
  const s = await stan(page);
  expect(s.tygodnieWiersz).toBe(false);
  expect(s.tygodnie).toBe('');
});

test('bez daty urodzenia tygodnie wpisuje lekarz, a miesiące liczą się z nich', async ({ page }) => {
  test.setTimeout(120_000);
  await otworz(page);

  // wiersz pojawia się, gdy wpisany wiek mieści się w oknie < 3 mies.
  await wpisz(page, 'age', '0');
  await wpisz(page, 'ageMonths', '1');
  expect((await stan(page)).tygodnieWiersz).toBe(true);

  await wpisz(page, 'ageWeeks', '6');
  const s = await stan(page);
  expect(s.age).toBe('0');
  expect(s.ageMonths).toBe('1');
  expect(s.ageReadOnly).toBe(true);
  expect(s.tygodnieReadOnly).toBe(false);
  expect(s.tygodnieNotka).toContain('6 tygodni');
  expect(s.tygodnieNotka).toContain('przybliżenie');

  // 9 tygodni to już drugi ukończony miesiąc
  await wpisz(page, 'ageWeeks', '9');
  expect((await stan(page)).ageMonths).toBe('2');
});

test('tygodnie poza zakresem odsyłają do miesięcy i nie blokują pól wieku', async ({ page }) => {
  test.setTimeout(120_000);
  await otworz(page);

  await wpisz(page, 'age', '0');
  await wpisz(page, 'ageWeeks', '20');
  const s = await stan(page);
  expect(s.tygodnieBlad).toContain('miesiącach');
  expect(s.ageReadOnly).toBe(false);
});

test('ukończone tygodnie trafiają do rekordu obok miesięcy', async ({ page }) => {
  test.setTimeout(120_000);
  await otworz(page);

  await wpisz(page, 'age', '0');
  await wpisz(page, 'ageWeeks', '6');
  let zebrane = await page.evaluate(() => window.collectUserData());
  expect(zebrane.user.ageWeeks).toBe(6);
  expect(zebrane.user.ageMonths).toBe(1);

  // z datą urodzenia liczbę podaje kalendarz
  await wpisz(page, 'dobInput', dataSprzedDni(61));
  zebrane = await page.evaluate(() => window.collectUserData());
  expect(zebrane.user.ageWeeks).toBe(8);

  // poza oknem < 3 mies. tygodnie przestają nieść informację i znikają z rekordu
  await wpisz(page, 'dobInput', dataSprzedDni(200));
  zebrane = await page.evaluate(() => window.collectUserData());
  expect(zebrane.user.ageWeeks).toBeUndefined();
});

test('tygodnie z wczytanego rekordu wracają do formularza, gdy rekord nie ma daty', async ({ page }) => {
  test.setTimeout(120_000);
  await otworz(page);

  await page.evaluate(() => {
    window.lastLoadedData = { user: { ageWeeks: 6, age: 0, ageMonths: 1, sex: 'M' } };
    document.dispatchEvent(new Event('vilda:patient-loaded'));
  });
  await page.waitForFunction(() => document.getElementById('ageWeeks').value !== '');

  const s = await stan(page);
  expect(s.tygodnie).toBe('6');
  expect(s.tygodnieWiersz).toBe(true);
  expect(s.ageMonths).toBe('1');
});

// P-DOB-CLR (zgłoszenie właściciela 2026-09-14): „Wyczyść wszystkie pola" zostawiało datę
// urodzenia w formularzu, więc kolejny pacjent zaczynał z datą poprzedniego. Moduł daty umiał
// się wyczyścić (nasłuchuje `vilda:user-state-cleared`), ale główny przycisk czyszczenia tego
// zdarzenia nie wysyła — nikt go o to nie prosił.
test('„Wyczyść wszystkie pola" kasuje datę urodzenia, tygodnie i odblokowuje wiek', async ({ page }) => {
  test.setTimeout(120_000);
  await otworz(page);

  await wpisz(page, 'dobInput', dataSprzedDni(40));
  let s = await stan(page);
  expect(s.dob).not.toBe('');
  expect(s.ageReadOnly, 'data urodzenia blokuje pole wieku').toBe(true);
  expect(s.tygodnieWiersz, 'poniżej 3 mies. widać wiersz tygodni').toBe(true);

  await page.evaluate(() => {
    const b = document.getElementById('clearAllDataBtn');
    if (!b) throw new Error('brak przycisku clearAllDataBtn');
    b.click();
  });
  await page.waitForFunction(() => document.getElementById('dobInput').value === '');

  s = await stan(page);
  expect(s.dob).toBe('');
  expect(s.tygodnie).toBe('');
  expect(s.ageReadOnly, 'po wyczyszczeniu wiek znowu jest do wpisania ręcznie').toBe(false);
  expect(s.ageMonthsReadOnly).toBe(false);
});
