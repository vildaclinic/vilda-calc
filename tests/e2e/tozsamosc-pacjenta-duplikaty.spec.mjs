import { expect, test } from '../support/test-czas.mjs';

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
// Service worker zablokowany: przy pierwszej wizycie instaluje się i robi `location.reload()`
// na `controllerchange`, co przerywa nawigację testu.
test.use({ serviceWorkers: 'block' });

const HASLO = 'E2e#Duplikaty!26b';
const IMIE = 'Testowy';
const NAZWISKO = 'Fikcyjny-Duplikat';
const PELNE = `${NAZWISKO} ${IMIE}`;

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
      && Boolean(window.VildaDobAge),
  );
}

function ustaw(page, pola) {
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

function zapisz(page) {
  return page.evaluate(async () => {
    await window.saveUserData();
    return true;
  });
}

function pacjenci(page) {
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

/* Wczytanie pacjenta tak, jak robi to zakładka Pacjenci: treść do formularza + zdarzenie
   z identyfikatorem, z którego `custom-fixes.js` ustawia bieżącego pacjenta.

   Wczytanie ZERUJE pola liczbowe formularza asynchronicznie (zachowanie sprzed tej zmiany —
   sprawdzone także na wersji z HEAD). Dlatego czekamy, aż to zerowanie się wykona, zanim test
   wpisze cokolwiek: bez tego wpisane wartości bywały kasowane tuż po wpisaniu i zapis w ogóle
   nie dochodził do skutku. Czekamy też na identyfikator bieżącego pacjenta. */
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
  await page.waitForFunction(() => {
    const w = document.getElementById('weight');
    return Boolean(w) && String(w.value).trim() === '';
  });
  return true;
}

/* Zapis, który nie może po cichu nie dojść do skutku: najpierw upewniamy się, że kolektor
   widzi komplet wymaganych pól (wiek, waga, wzrost), bo bez nich `saveUserData()` po prostu
   zwraca null i test przechodziłby pozornie. */
async function zapiszPewnie(page) {
  const user = await page.evaluate(() => (window.collectUserData() || {}).user || {});
  expect(user.age, 'wiek w kolektorze przed zapisem').not.toBeNull();
  expect(user.weight, 'waga w kolektorze przed zapisem').not.toBeNull();
  expect(user.height, 'wzrost w kolektorze przed zapisem').not.toBeNull();
  await zapisz(page);
}

test.describe('Dopisanie daty urodzenia nie tworzy drugiego pacjenta', () => {
  test('wczytany pacjent + data urodzenia + nowe pomiary = ten sam rekord', async ({ page }) => {
    await otworzZKontem(page);

    // 1. Pierwsza wizyta — pacjent BEZ daty urodzenia, tak jak rekordy sprzed tej funkcji.
    await ustaw(page, {
      firstName: IMIE, lastName: NAZWISKO, sex: 'M', age: '4', ageMonths: '3',
      weight: '17.5', height: '104',
    });
    await zapisz(page);

    let lista = await pacjenci(page);
    expect(lista).toHaveLength(1);
    expect(lista[0].dobISO).toBeFalsy();
    const pid = lista[0].patientId;

    // 2. Kolejna wizyta: wczytujemy tego pacjenta, dopisujemy datę urodzenia i nowe pomiary.
    await wczytaj(page, pid);

    const dataUr = await page.evaluate(() => {
      const d = new Date();
      const ur = new Date(d.getFullYear() - 4, d.getMonth() - 3, d.getDate());
      const dwa = (n) => String(n).padStart(2, '0');
      return `${dwa(ur.getDate())}.${dwa(ur.getMonth() + 1)}.${ur.getFullYear()}`;
    });
    await ustaw(page, { dobInput: dataUr });
    await ustaw(page, { weight: '18.2', height: '106' });
    await zapiszPewnie(page);

    // 3. NADAL jeden pacjent — i to ten sam, wzbogacony o datę urodzenia.
    lista = await pacjenci(page);
    expect(lista).toHaveLength(1);
    expect(lista[0].patientId).toBe(pid);
    expect(lista[0].dobISO).toBeTruthy();
    expect(lista[0].snapshotCount).toBeGreaterThan(1);
  });

  test('kolejny zapis wczytanego pacjenta też nie mnoży rekordów', async ({ page }) => {
    await otworzZKontem(page);

    await ustaw(page, {
      firstName: IMIE, lastName: NAZWISKO, sex: 'M', age: '4', ageMonths: '3',
      weight: '17.5', height: '104',
    });
    await zapisz(page);
    const pid = (await pacjenci(page))[0].patientId;

    for (const [wiek, mies, waga, wzrost] of [['4', '6', '18.0', '105'], ['4', '9', '18.4', '106'], ['5', '0', '18.9', '107']]) {
      await wczytaj(page, pid);
      // Kolejna wizyta: lekarz wpisuje aktualny wiek i świeże pomiary.
      await ustaw(page, { age: wiek, ageMonths: mies, weight: waga, height: wzrost });
      await zapiszPewnie(page);
    }

    const lista = await pacjenci(page);
    expect(lista).toHaveLength(1);
    expect(lista[0].patientId).toBe(pid);
    // Bez tego warunku test przechodziłby także wtedy, gdyby zapisy w ogóle się nie wykonały —
    // a tak właśnie było w pierwszej wersji tego testu. Nie sprawdzamy dokładnej liczby zapisów:
    // sejf potrafi scalić zapis, który niczego nie zmienia, więc liczba bywa mniejsza niż liczba
    // kliknięć. Istotne jest, że zapisy trafiły do JEDNEGO rekordu.
    expect(lista[0].snapshotCount).toBeGreaterThan(1);
  });

  test('inne nazwisko w formularzu zakłada nowego pacjenta, nie nadpisuje wczytanego', async ({ page }) => {
    await otworzZKontem(page);

    await ustaw(page, {
      firstName: IMIE, lastName: NAZWISKO, sex: 'M', age: '4', ageMonths: '3',
      weight: '17.5', height: '104',
    });
    await zapisz(page);
    const pid = (await pacjenci(page))[0].patientId;

    // Lekarz nie czyści formularza i wpisuje dane INNEGO dziecka. Zmiana nazwiska czyści pola
    // wieku (zachowanie aplikacji sprzed tej zmiany), więc lekarz wpisuje wiek na nowo.
    await wczytaj(page, pid);
    await ustaw(page, { firstName: 'Drugi', lastName: 'Inny-Fikcyjny' });
    await ustaw(page, { age: '7', ageMonths: '1', weight: '20.1', height: '110' });
    await zapiszPewnie(page);

    const lista = await pacjenci(page);
    expect(lista).toHaveLength(2);
    const stary = lista.find((p) => p.patientId === pid);
    expect(stary, 'rekord pierwszego pacjenta nadal istnieje').toBeTruthy();
    expect(stary.name).toContain(NAZWISKO);
  });
});
