import { expect, test } from '../support/test-czas.mjs';

// P-SPOJNOSC-ZAPISOW (makieta zaakceptowana przez właściciela 2026-09-30): „Sprawdzenie spójności zapisów”
// w Ustawieniach → Kopie zapasowe pacjentów. Szuka zapisów innego pacjenta w karcie (skutek wyścigu
// naprawionego w P-POWLOKA-ID, #491) i niczego nie zmienia. Reguły i przebieg na sejfie sprawdza
// tests/unit/spojnosc-zapisow.test.mjs; tutaj widok, tylko-odczyt na żywej stronie i telefon.
//
// Test zakłada WŁASNE, fikcyjne konto sejfu. Osoby fikcyjne: „Innyrecz Adam” (karta z pomyłką),
// „Probna Alicja” (własna karta i zapis w karcie Adama), „Testowy Jan” (inna pisownia w jednym zapisie).
test.use({ serviceWorkers: 'block' });

const HASLO = 'E2e#SpojnoscZapisow!26a';

async function przygotuj(page) {
  page.on('dialog', (d) => d.accept());
  await page.addInitScript(() => {
    try {
      window.localStorage.setItem('vilda-terms-accepted-v1', JSON.stringify({ version: 1, acceptedAtISO: new Date().toISOString() }));
      window.localStorage.setItem('analyticsConsent', 'denied');
    } catch (_) { /* brak storage — pomiń */ }
  });
}

async function gotowa(page) {
  await page.waitForFunction(() => Boolean(window.VildaVault) && window.VildaVault.isUnlocked());
  await page.waitForFunction(() => !document.documentElement.classList.contains('vilda-auth-locked'));
  await page.waitForFunction(() => {
    const root = document.getElementById('vilda-auth-ui-root');
    return !root || window.getComputedStyle(root).display === 'none';
  });
  await page.waitForFunction(() => document.getElementById('recordConsistencyCard')?.getAttribute('data-spojnosc') === 'gotowa');
}

async function otworzZKontem(page) {
  await przygotuj(page);
  await page.goto('/ustawienia.html', { waitUntil: 'load' });
  await page.waitForFunction(() => Boolean(window.VildaVault));
  await page.evaluate(async (pw) => window.VildaVault.createUser(pw, { label: 'e2e', iterations: 10000 }), HASLO);
  await page.reload({ waitUntil: 'load' });
  await gotowa(page);
}

// Sejf z pomyłką: zapis Alicji z identyfikatorem karty Adama, jak robił to DocPro przed #491.
async function zasiej(page) {
  return page.evaluate(async () => {
    const v = window.VildaVault;
    const krok = () => new Promise((r) => { const t = Date.now(); const f = () => (Date.now() > t + 1 ? r() : setTimeout(f, 1)); f(); });
    const osoba = (lastName, firstName, dobISO, sex, height, weight, name) => ({
      name: name || `${lastName} ${firstName}`,
      user: { lastName, firstName, dobISO, sex, height, weight },
    });
    const zapisz = async (p, o = {}) => { await krok(); return v.savePatient(p, { dedup: false, ...o }); };
    const a = await zapisz(osoba('Innyrecz', 'Adam', '2016-03-12', 'M', 120, 22));
    await zapisz(osoba('Innyrecz', 'Adam', '2016-03-12', 'M', 121, 22.5), { patientId: a.patientId });
    const b = await zapisz(osoba('Probna', 'Alicja', '2012-08-05', 'F', 148, 50));
    await zapisz(osoba('Probna', 'Alicja', '2012-08-05', 'F', 149.2, 51.4), { patientId: a.patientId });
    const c = await zapisz(osoba('Testowy', 'Jan', '2019-11-21', 'M', 115.9, 20.1));
    await zapisz(osoba('Testowy', 'Jan Piotr', '2019-11-21', 'M', 118.4, 21), { patientId: c.patientId });
    return { a: a.patientId, b: b.patientId, c: c.patientId };
  });
}

// Odcisk sejfu: karty, zapisy, rewizje, chwile zmian i nazwy — wszystko, co zapis mógłby ruszyć.
const odcisk = (page) => page.evaluate(async () => {
  const v = window.VildaVault;
  const lista = await v.listPatients();
  const karty = [];
  for (const p of lista) {
    const r = await v.getPatient(p.patientId);
    karty.push({
      id: p.patientId, naLiscie: p.header.name, ostatni: p.lastSavedAtISO,
      zapisy: r.snapshots.map((s) => [s.snapshotId, s.rev, s.updatedAtISO, s.pinned, s.payload && s.payload.name].join('|')),
    });
  }
  return JSON.stringify(karty);
});

async function otworzSekcje(page) {
  const sekcja = page.locator('#settings-section-backup');
  if ((await sekcja.getAttribute('open')) === null) await sekcja.locator('summary').click();
  await expect(page.locator('#recordConsistencyRunBtn')).toBeVisible();
}

const wynik = (page) => page.locator('#recordConsistencyResult');

test.describe('P-SPOJNOSC-ZAPISOW — sprawdzenie spójności zapisów', () => {
  test('wskazuje kartę z zapisem innej osoby i kartę z inną pisownią, niczego nie zmieniając', async ({ page }) => {
    await otworzZKontem(page);
    const id = await zasiej(page);
    await otworzSekcje(page);
    await expect(page.locator('#recordConsistencyLast')).toHaveText('Ostatnie sprawdzenie: nigdy');

    const przed = await odcisk(page);
    await page.locator('#recordConsistencyRunBtn').click();
    await expect(wynik(page)).toBeVisible();
    await expect(page.locator('#recordConsistencyIntro'), 'po sprawdzeniu widać tylko wynik').toBeHidden();

    await expect(wynik(page).locator('.settings-spojnosc-podsumowanie-zdanie'))
      .toHaveText('● Sprawdzono 3 karty i 6 zapisów. 2 karty do przejrzenia.');
    await expect(wynik(page).locator('.settings-spojnosc-chip')).toHaveText(['1 prawdopodobna pomyłka', '1 do sprawdzenia', '1 bez uwag']);
    await expect(wynik(page).locator('.settings-spojnosc-podsumowanie'), 'fokus po zniknięciu przycisku').toBeFocused();
    await expect(page.locator('#recordConsistencyLive')).toHaveText('Sprawdzono 3 karty i 6 zapisów. 2 karty do przejrzenia.');

    const karty = wynik(page).locator('article');
    await expect(karty).toHaveCount(2);
    const adam = karty.nth(0);
    await expect(adam.locator('h4')).toHaveText('Karta: Innyrecz Adam');
    await expect(adam.locator('.settings-spojnosc-etykieta')).toHaveText('● Prawdopodobna pomyłka');
    await expect(adam).toContainText('Na liście pacjentów ta karta widnieje jako „Probna Alicja”, bo nazwa karty pochodzi z ostatniego zapisu.');
    const obcy = adam.locator('tr.settings-spojnosc-wiersz--obcy');
    await expect(obcy).toHaveCount(1);
    // Widoczny tekst komórek (dopisek „ur. ” jest tylko w układzie telefonu).
    const komorki = await obcy.locator('td').allInnerTexts();
    expect(komorki.map((t) => t.replace(/\u00a0/g, ' '))).toEqual([
      expect.stringMatching(/^\d{2}\.\d{2}\.\d{4}, \d{2}:\d{2}$/), 'Probna Alicja', '05.08.2012', 'K', '149,2 cm · 51,4 kg', '● inna osoba']);
    await expect(adam.locator('tbody tr')).toHaveCount(3);
    await expect(adam.locator('.settings-spojnosc-dowod'))
      .toHaveText(/^Zapis z .+ ma nazwisko, datę urodzenia i płeć innej osoby\. „Probna Alicja” \(ur\. 05\.08\.2012\) ma w sejfie własną kartę\.$/);
    await expect(adam.getByRole('button')).toHaveText(['Otwórz historię wersji', 'Otwórz kartę: Probna Alicja']);

    const jan = karty.nth(1);
    await expect(jan.locator('h4')).toHaveText('Karta: Testowy Jan');
    await expect(jan.locator('.settings-spojnosc-etykieta')).toHaveText('ℹ Do sprawdzenia');
    await expect(jan.locator('tr.settings-spojnosc-wiersz--pisownia td').nth(1)).toHaveText('Testowy Jan Piotr');
    await expect(jan.getByRole('button')).toHaveText(['Otwórz historię wersji']);

    await expect(wynik(page).locator('aside')).toContainText('Usunięcie pomylonego zapisu nie jest jeszcze dostępne.');
    expect(await odcisk(page), 'sprawdzenie niczego w sejfie nie zmieniło').toBe(przed);

    // „Otwórz kartę” pokazuje tamtą kartę tylko do podglądu — bez „Wczytaj tego pacjenta”.
    await adam.getByRole('button', { name: 'Otwórz kartę: Probna Alicja' }).click();
    const podglad = page.locator('.vilda-auth-patient-card');
    await expect(podglad).toBeVisible();
    await expect(podglad).toContainText('Probna');
    await expect(podglad.getByRole('button', { name: /Wczytaj tego pacjenta/ })).toHaveCount(0);
    expect(id.b).toBeTruthy();
  });

  test('wynik znika po odświeżeniu, a „Ostatnie sprawdzenie” zostaje; brak uwag ma własny komunikat', async ({ page }) => {
    await otworzZKontem(page);
    await page.evaluate(async () => window.VildaVault.savePatient({
      name: 'Testowa Ewa', user: { lastName: 'Testowa', firstName: 'Ewa', dobISO: '2014-01-01', sex: 'F', height: 120, weight: 21 },
    }, { dedup: false }));
    await otworzSekcje(page);
    await page.locator('#recordConsistencyRunBtn').click();
    await expect(wynik(page).locator('.settings-spojnosc-podsumowanie--ok'))
      .toHaveText(/^✓ Sprawdzono 1 kartę i 1 zapis\. Nie znaleziono zapisów innego pacjenta\.\d{2}\.\d{2}\.\d{4}, \d{2}:\d{2}$/);
    await expect(wynik(page).locator('article')).toHaveCount(0);
    await expect(wynik(page).locator('aside')).toHaveCount(0);

    await page.reload({ waitUntil: 'load' });
    await gotowa(page);
    await otworzSekcje(page);
    await expect(wynik(page)).toBeHidden();
    await expect(page.locator('#recordConsistencyLast')).toHaveText(/^Ostatnie sprawdzenie: \d{2}\.\d{2}\.\d{4}, \d{2}:\d{2}$/);
  });

  test('nazwisko z sejfu jest tekstem, nie znacznikiem', async ({ page }) => {
    await otworzZKontem(page);
    await page.evaluate(async () => {
      const v = window.VildaVault;
      const a = await v.savePatient({ name: 'Testowa Ewa', user: { lastName: 'Testowa', firstName: 'Ewa', dobISO: '2014-01-01', sex: 'F' } }, { dedup: false });
      await new Promise((r) => { setTimeout(r, 5); });
      await v.savePatient({ name: 'Probna <img src=x onerror="window.__xssSpojnosc=1"> Ola', user: { dobISO: '2011-02-02', sex: 'F' } },
        { dedup: false, patientId: a.patientId });
    });
    await otworzSekcje(page);
    await page.locator('#recordConsistencyRunBtn').click();
    const obcy = wynik(page).locator('tr.settings-spojnosc-wiersz--obcy td').nth(1);
    await expect(obcy).toHaveText('Probna <img src=x onerror="window.__xssSpojnosc=1"> Ola');
    await expect(wynik(page).locator('img')).toHaveCount(0);
    expect(await page.evaluate(() => window.__xssSpojnosc)).toBeUndefined();
  });

  test('„Przerwij” zatrzymuje sprawdzanie między kartami i mówi, ile sprawdzono', async ({ page }) => {
    await otworzZKontem(page);
    await zasiej(page);
    // Każda karta czeka na zgodę testu — tak widać stan „w trakcie” i działa przerwanie.
    await page.evaluate(() => {
      const v = window.VildaVault;
      const zwolnij = [];
      window.__spojnoscZwolnij = () => { while (zwolnij.length) zwolnij.shift()(); };
      window.VildaVault = new Proxy(v, {
        get(cel, nazwa) {
          if (nazwa !== 'getPatient') return cel[nazwa];
          return async (pid) => { await new Promise((r) => { zwolnij.push(r); }); return cel.getPatient(pid); };
        },
      });
    });
    await otworzSekcje(page);
    await page.locator('#recordConsistencyRunBtn').click();
    const postep = page.locator('#recordConsistencyProgress');
    await expect(postep).toBeVisible();
    await expect(page.locator('#recordConsistencyCounter')).toHaveText('0 z 3');
    await page.evaluate(() => window.__spojnoscZwolnij());
    await expect(page.locator('#recordConsistencyCounter')).toHaveText('1 z 3');
    await page.locator('#recordConsistencyStopBtn').click();
    await page.evaluate(() => window.__spojnoscZwolnij());
    await expect(wynik(page).locator('.settings-spojnosc-podsumowanie-zdanie'))
      .toHaveText(/^(● )?Sprawdzanie przerwane: sprawdzono 2 z 3 kart i \d+ zapis/);
    await expect(page.locator('#recordConsistencyLast'), 'przerwane sprawdzenie nie jest „ostatnim sprawdzeniem”')
      .toHaveText('Ostatnie sprawdzenie: nigdy');
  });

  test('telefon: wiersze jako bloki, bez poziomego przewijania', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await otworzZKontem(page);
    await zasiej(page);
    await otworzSekcje(page);
    await page.locator('#recordConsistencyRunBtn').click();
    await expect(wynik(page).locator('article')).toHaveCount(2);
    const adam = wynik(page).locator('article').first();
    await expect(adam.locator('thead')).toBeHidden();
    await expect(adam.locator('tr.settings-spojnosc-wiersz--obcy .settings-spojnosc-tylko-telefon')).toBeVisible();
    const uklad = await page.evaluate(() => {
      const wiersz = document.querySelector('#recordConsistencyResult tr.settings-spojnosc-wiersz--obcy');
      const nazwa = wiersz.querySelector('.settings-spojnosc-kol-nazwa').getBoundingClientRect();
      const uwaga = wiersz.querySelector('.settings-spojnosc-kol-uwaga').getBoundingClientRect();
      const dob = wiersz.querySelector('.settings-spojnosc-kol-dob').getBoundingClientRect();
      return {
        przewijanie: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        karta: document.getElementById('recordConsistencyCard').getBoundingClientRect().right,
        szerokosc: window.innerWidth,
        uwagaNadNazwa: uwaga.bottom <= nazwa.top + 1,
        dobPodNazwa: dob.top >= nazwa.bottom - 1,
      };
    });
    expect(uklad.przewijanie, 'brak poziomego przewijania strony').toBeLessThanOrEqual(0);
    expect(uklad.karta).toBeLessThanOrEqual(uklad.szerokosc);
    expect(uklad.uwagaNadNazwa, '„inna osoba” i chwila zapisu w pierwszej linii').toBe(true);
    expect(uklad.dobPodNazwa, 'data urodzenia, płeć i pomiary pod nazwiskiem').toBe(true);
  });

  // Blokada sejfu przenosi na ekran logowania; komunikat modułu na tę okoliczność (gdy strona zostaje) sprawdza
  // test jednostkowy „zablokowany sejf”.
  test('sejf zablokowany w trakcie: sprawdzenie się urywa, nic nie zostaje zapisane', async ({ page }) => {
    await otworzZKontem(page);
    await zasiej(page);
    await page.evaluate(() => {
      const v = window.VildaVault;
      const zwolnij = [];
      window.__spojnoscZwolnij = () => { while (zwolnij.length) zwolnij.shift()(); };
      window.__spojnoscZablokuj = () => v.lock();
      window.VildaVault = new Proxy(v, {
        get(cel, nazwa) {
          if (nazwa !== 'getPatient') return cel[nazwa];
          return async (pid) => { await new Promise((r) => { zwolnij.push(r); }); return cel.getPatient(pid); };
        },
      });
    });
    await otworzSekcje(page);
    await page.locator('#recordConsistencyRunBtn').click();
    await expect(page.locator('#recordConsistencyCounter')).toHaveText('0 z 3');
    // Automatyczna blokada (np. bezczynność) w środku sprawdzania.
    await page.evaluate(() => { window.__spojnoscZablokuj(); window.__spojnoscZwolnij(); });
    await expect(page.getByText('Kto się loguje?')).toBeVisible();
    await expect(wynik(page).locator('article')).toHaveCount(0);
    expect(await page.evaluate(() => window.localStorage.getItem('recordConsistencyLastCheck'))).toBeNull();
  });
});
