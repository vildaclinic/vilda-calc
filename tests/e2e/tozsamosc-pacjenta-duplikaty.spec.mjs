import { expect, test } from '../support/test-czas.mjs';
import { czekajNaPacjentow } from '../support/sejf-czekanie.mjs';

// P-DUP (zgłoszenie właściciela 2026-09-14) — odtworzenie zgłoszonego przebiegu na PRAWDZIWEJ
// stronie: pacjent z bazy + dopisana data urodzenia w formularzu głównym = NOWY pacjent.
//
// Test jednostkowy mierzy samą bramkę tożsamości. Tutaj sprawdzamy to, czego tamten nie może:
// że po dopisaniu daty urodzenia i zapisaniu w bazie nadal jest JEDEN rekord, a nie dwa — i że
// data faktycznie trafiła do główki istniejącego rekordu.
//
// Test zakłada WŁASNE, fikcyjne konto sejfu w efemerycznym profilu przeglądarki (ten sam wzorzec
// co karta-pacjenta-centyl-wieku-pomiaru.spec.mjs). Nie dotyka żadnego prawdziwego sejfu ani
// żadnych prawdziwych danych. Wszystkie dane są jednoznacznie fikcyjne.
//
// DLACZEGO TYLE POTWIERDZANIA. Formularz dochodzi do stanu ustalonego ASYNCHRONICZNIE: wczytanie
// pacjenta uruchamia kaskadę zerowania pól z opóźnieniami, a imię i nazwisko spływają do pola
// `#name` (to ono jest nazwą rekordu) też z opóźnieniem. Człowiek tego nie zauważy — zanim zdąży
// cokolwiek napisać, kaskada dawno się skończyła. Test pisze natychmiast, więc bez potwierdzania
// migotał: raz kasowało mu świeżo wpisaną datę, raz zapisywał jeszcze pod starą nazwą. Dlatego
// każdy zapis poprzedzamy sprawdzeniem, że KOLEKTOR widzi dokładnie to, co zamierzamy zapisać.
// To nie jest obchodzenie usterki produktu, tylko dostrojenie testu do tempa maszyny.
//
// Service worker zablokowany: przy pierwszej wizycie instaluje się i robi `location.reload()`
// na `controllerchange`, co przerywa nawigację testu.
test.use({ serviceWorkers: 'block' });

const HASLO = 'E2e#Duplikaty!26b';
const IMIE = 'Testowy';
const NAZWISKO = 'Fikcyjny-Duplikat';

async function otworzZKontem(page) {
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
  await page.waitForFunction(
    () => typeof window.saveUserData === 'function'
      && typeof window.applyLoadedData === 'function'
      && typeof window.collectUserData === 'function'
      && Boolean(window.VildaDobAge),
  );
}

function wpiszPola(page, pola) {
  return page.evaluate((p) => {
    Object.keys(p).forEach((id) => {
      const el = document.getElementById(id);
      if (!el) throw new Error('brak pola ' + id);
      el.value = p[id];
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    });
  }, pola);
}

function zebrane(page) {
  return page.evaluate(() => {
    const d = window.collectUserData() || {};
    return { name: d.name || null, user: d.user || {} };
  });
}

/* Wpisuje pola i powtarza wpis, dopóki kolektor nie potwierdzi oczekiwanego stanu. Zwraca to,
   co kolektor ostatecznie zobaczył — czyli dokładnie to, co pójdzie do zapisu. */
async function wpiszIPotwierdz(page, pola, warunek, opis) {
  let ostatnie = null;
  for (let proba = 0; proba < 15; proba += 1) {
    await wpiszPola(page, pola);
    ostatnie = await zebrane(page);
    if (warunek(ostatnie)) return ostatnie;
    await page.waitForTimeout(200);
  }
  throw new Error(`formularz nie ustalił się na: ${opis} (ostatnio: ${JSON.stringify(ostatnie)})`);
}

/* Zapis, który nie może po cichu nie dojść do skutku.
   Dwa powody, oba zmierzone:
   1. `saveUserData()` przy niekompletnym formularzu po prostu zwraca null — test
      przechodziłby pozornie. Stąd sprawdzenie kolektora przed zapisem.
   2. `saveUserData()` NIE ZWRACA obietnicy zapisu: oddaje payload i zostawia zapis w tle
      (`return a` po łańcuchu `.then`). `await` na nim niczego więc nie czeka, a odczyt sejfu
      zaraz potem bywa szybszy niż sam zapis. Przy czterech workerach ten wyścig przegrywał
      co drugi przebieg — z rekordem `snapshotCount: 1` przy komplecie danych w kolektorze
      i bez żadnego komunikatu. Dlatego czekamy na SKUTEK w rekordzie, nie na powrót
      z funkcji. */
async function zapiszPewnie(page, potwierdz) {
  const stan = await zebrane(page);
  expect(stan.user.age, 'wiek w kolektorze przed zapisem').not.toBeNull();
  expect(stan.user.weight, 'waga w kolektorze przed zapisem').not.toBeNull();
  expect(stan.user.height, 'wzrost w kolektorze przed zapisem').not.toBeNull();
  await page.evaluate(async () => { await window.saveUserData(); });
  if (typeof potwierdz !== 'function') return;
  await expect.poll(async () => potwierdz(await pacjenci(page)), {
    message: 'zapis nie odbił się w rekordzie',
    timeout: 20_000,
  }).toBe(true);
}

async function pacjenci(page) {
  return page.evaluate(async () => {
    const lista = await window.VildaVault.listPatients();
    const out = [];
    for (const p of lista) {
      const pelny = await window.VildaVault.getPatient(p.patientId);
      out.push({
        patientId: p.patientId,
        name: (pelny && pelny.header && pelny.header.name) || null,
        dobISO: (pelny && pelny.header && pelny.header.dobISO) || null,
        snapshotCount: (pelny && pelny.snapshotCount) || 0,
      });
    }
    return out;
  });
}

/* Wczytanie pacjenta tak, jak robi to zakładka Pacjenci: treść do formularza przez
   `applyLoadedData` + zdarzenie z identyfikatorem, z którego `custom-fixes.js` ustawia bieżącego
   pacjenta. Prawdziwy przycisk „Wczytaj tego pacjenta" siedzi w domknięciu `vilda_auth_ui.js`
   i nie da się go wywołać z testu, ale obie ścieżki przechodzą przez te same funkcje. */
async function wczytaj(page, patientId) {
  await page.evaluate(async (pid) => {
    const p = await window.VildaVault.getPatient(pid);
    const snap = p && p.snapshots && p.snapshots[0];
    if (!snap || !snap.payload) throw new Error('brak zapisu do wczytania');
    window.applyLoadedData(snap.payload);
    document.dispatchEvent(new CustomEvent('vilda:patient-loaded', {
      detail: { patientId: pid, savedAtISO: snap.savedAtISO || null, snapshotCount: p.snapshotCount || 1 },
    }));
    return true;
  }, patientId);
  await page.waitForFunction(() => typeof window._vildaCurrentPatientId === 'string');
  return true;
}

/* Pierwsza wizyta: komplet danych, zapis i oczekiwanie, aż rekord naprawdę pojawi się w bazie. */
async function pierwszaWizyta(page) {
  await wpiszIPotwierdz(
    page,
    { firstName: IMIE, lastName: NAZWISKO, sex: 'M', age: '4', ageMonths: '3', weight: '17.5', height: '104' },
    (s) => String(s.name || '').includes(NAZWISKO) && s.user.weight === 17.5 && s.user.age === 4,
    'komplet danych pierwszej wizyty',
  );
  await zapiszPewnie(page);
  await czekajNaPacjentow(page, 1);
  const lista = await pacjenci(page);
  expect(lista).toHaveLength(1);
  return lista[0];
}

test.describe('Dopisanie daty urodzenia nie tworzy drugiego pacjenta', () => {
  test('wczytany pacjent + data urodzenia + nowe pomiary = ten sam rekord', async ({ page }) => {
    test.setTimeout(120_000);
    await otworzZKontem(page);

    // 1. Pierwsza wizyta — pacjent BEZ daty urodzenia, tak jak rekordy sprzed tej funkcji.
    const pierwszy = await pierwszaWizyta(page);
    expect(pierwszy.dobISO).toBeFalsy();
    const pid = pierwszy.patientId;

    // 2. Kolejna wizyta: wczytujemy tego pacjenta, dopisujemy datę urodzenia i nowe pomiary.
    await wczytaj(page, pid);
    const dataUr = await page.evaluate(() => {
      const d = new Date();
      const ur = new Date(d.getFullYear() - 4, d.getMonth() - 3, d.getDate());
      const dwa = (n) => String(n).padStart(2, '0');
      return `${dwa(ur.getDate())}.${dwa(ur.getMonth() + 1)}.${ur.getFullYear()}`;
    });
    await wpiszIPotwierdz(
      page,
      { dobInput: dataUr, weight: '18.2', height: '106' },
      (s) => Boolean(s.user.dobISO) && s.user.weight === 18.2 && s.user.height === 106,
      'data urodzenia i nowe pomiary',
    );
    await zapiszPewnie(page, (l) => l.length === 1 && Boolean(l[0].dobISO));

    // 3. NADAL jeden pacjent — i to ten sam, wzbogacony o datę urodzenia.
    const lista = await pacjenci(page);
    expect(lista).toHaveLength(1);
    expect(lista[0].patientId).toBe(pid);
    expect(lista[0].dobISO).toBeTruthy();
    expect(lista[0].snapshotCount).toBeGreaterThan(1);
  });

  test('kolejne wizyty wczytanego pacjenta nie mnożą rekordów', async ({ page }) => {
    test.setTimeout(120_000);
    await otworzZKontem(page);
    const pid = (await pierwszaWizyta(page)).patientId;

    const wizyty = [['4', '6', '18.0', '105'], ['4', '9', '18.4', '106'], ['5', '0', '18.9', '107']];
    for (const [wiek, mies, waga, wzrost] of wizyty) {
      const wersjiPrzed = (await pacjenci(page))[0].snapshotCount;
      await wczytaj(page, pid);
      await wpiszIPotwierdz(
        page,
        { age: wiek, ageMonths: mies, weight: waga, height: wzrost },
        (s) => s.user.weight === Number(waga) && s.user.age === Number(wiek),
        `wizyta ${wiek}/${mies}`,
      );
      await zapiszPewnie(page, (l) => l.length === 1 && l[0].snapshotCount > wersjiPrzed);
    }

    const lista = await pacjenci(page);
    expect(lista).toHaveLength(1);
    expect(lista[0].patientId).toBe(pid);
    // Bez tego warunku test przechodziłby także wtedy, gdyby zapisy w ogóle się nie wykonały —
    // a tak właśnie było w pierwszej wersji tego testu. Nie sprawdzamy dokładnej liczby: sejf
    // potrafi scalić zapis, który niczego nie zmienia.
    expect(lista[0].snapshotCount).toBeGreaterThan(1);
  });

  test('inne nazwisko w formularzu zakłada nowego pacjenta, nie nadpisuje wczytanego', async ({ page }) => {
    test.setTimeout(120_000);
    await otworzZKontem(page);
    const pid = (await pierwszaWizyta(page)).patientId;

    // Lekarz nie czyści formularza i wpisuje dane INNEGO dziecka. Zmiana nazwiska czyści pola
    // wieku (zachowanie aplikacji sprzed tej zmiany), więc wiek wpisuje na nowo.
    await wczytaj(page, pid);
    await wpiszIPotwierdz(
      page,
      { firstName: 'Drugi', lastName: 'Inny-Fikcyjny' },
      (s) => String(s.name || '').includes('Inny-Fikcyjny'),
      'nowe nazwisko w kolektorze',
    );
    await wpiszIPotwierdz(
      page,
      { age: '7', ageMonths: '1', weight: '20.1', height: '110' },
      (s) => String(s.name || '').includes('Inny-Fikcyjny') && s.user.weight === 20.1 && s.user.age === 7,
      'dane drugiego dziecka',
    );
    await zapiszPewnie(page, (l) => l.length === 2);

    const lista = await pacjenci(page);
    expect(lista).toHaveLength(2);
    const stary = lista.find((p) => p.patientId === pid);
    expect(stary, 'rekord pierwszego pacjenta nadal istnieje').toBeTruthy();
    expect(stary.name).toContain(NAZWISKO);
  });
});
