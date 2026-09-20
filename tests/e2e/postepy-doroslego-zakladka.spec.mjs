import { expect, test } from '../support/test-czas.mjs';

// P-POSTEPY rata 2 na PRAWDZIWEJ stronie: zakładka postępów w Karcie Pacjenta dorosłego.
//
// Do SW 1.1.11 dorosły widział w tej zakładce wyłącznie zdanie „Siatki centylowe dostępne
// tylko dla dzieci i młodzieży (< 18 lat)". Testy jednostkowe pilnują silnika i widoku;
// ten test pilnuje tego, co lekarz naprawdę zobaczy po kliknięciu.
//
// Dane pacjentów wyłącznie FIKCYJNE; sejf zakładany na potrzeby testu.
test.use({ serviceWorkers: 'block' });

const HASLO = 'E2e#Postepy!26a';

async function otworzZKontem(page) {
  await page.addInitScript(() => {
    try {
      window.localStorage.setItem('vilda-terms-accepted-v1',
        JSON.stringify({ version: 1, acceptedAtISO: new Date().toISOString() }));
    } catch (_) { /* brak storage — pomiń */ }
  });
  await page.goto('/index.html', { waitUntil: 'load' });
  await page.waitForFunction(() => Boolean(window.VildaVault));
  await page.evaluate(async (pw) => window.VildaVault.createUser(pw, { label: 'e2e', iterations: 10000 }), HASLO);
  await page.reload({ waitUntil: 'load' });
  await page.waitForFunction(() => Boolean(window.VildaVault) && window.VildaVault.isUnlocked());
  await page.waitForFunction(() => !document.documentElement.classList.contains('vilda-auth-locked'));
  await page.waitForFunction(() => Boolean(window.VildaAuthUI)
    && Boolean(window.VildaPostepyDoroslego) && Boolean(window.VildaPostepyDoroslegoUI));
}

/** Pacjent z serią pomiarów w karcie zaawansowanej + opcjonalnymi punktami leczenia. */
async function zalozPacjenta(page, { imie, wiekLat, pomiary, punkty }) {
  return page.evaluate(async (d) => {
    const wynik = await window.VildaVault.savePatient({
      name: `Testowy ${d.imie}`,
      user: {
        lastName: 'Testowy', firstName: d.imie, sex: 'M',
        age: d.wiekLat, ageMonths: 0,
        height: d.pomiary[d.pomiary.length - 1].height,
        weight: d.pomiary[d.pomiary.length - 1].weight,
      },
      advanced: { data: { measurements: d.pomiary } },
      obesityTherapyPoints: d.punkty || [],
    }, { dedup: false });
    return wynik.patientId;
  }, { imie, wiekLat, pomiary, punkty });
}

async function otworzZakladkeTraj(page, patientId) {
  await page.evaluate((id) => window.VildaAuthUI.showPatientCard(id), patientId);
  const przycisk = page.locator('.vilda-patient-tab[data-tab="traj"]');
  await expect(przycisk).toBeVisible();
  const etykieta = (await przycisk.textContent() || '').trim();
  await przycisk.click();
  return etykieta;
}

// UWAGA NA KONWENCJE WIEKU. Wiersze `advanced.data.measurements` sejf czyta przez
// `Math.round(ageMonths)` — czyli `ageMonths` jest tam CALOSCIA. Punkty monitora otylosci
// (nizej) uzywaja rozbicia: ageYears = pelne lata, ageMonths = reszta 0..11. Te same nazwy
// pol, dwa znaczenia; pomylka daje pomiar w wieku 0 miesiecy i wykres bez sensu.
const POMIARY_DOROSLY = [
  { ageYears: 47, ageMonths: 564, height: 167, weight: 112.4, dateISO: '2026-01-08' },
  { ageYears: 47.2, ageMonths: 566, height: 167, weight: 104.1, dateISO: '2026-03-05' },
  { ageYears: 47.3, ageMonths: 568, height: 167, weight: 96.2, dateISO: '2026-05-14' },
  { ageYears: 47.7, ageMonths: 572, height: 167, weight: 88.6, dateISO: '2026-09-10' },
];

test.describe('P-POSTEPY — dorosły dostaje wykres zamiast komunikatu o siatkach', () => {
  test('POSTEPY-1: zakładka nazywa się „Postępy" i pokazuje wykres masy', async ({ page }) => {
    await otworzZKontem(page);
    const pid = await zalozPacjenta(page, { imie: 'Postepy-A', wiekLat: 47, pomiary: POMIARY_DOROSLY });
    const etykieta = await otworzZakladkeTraj(page, pid);

    expect(etykieta, 'dorosłemu nie obiecujemy siatek centylowych').toContain('Postępy');

    const panel = page.locator('.vilda-pd-host');
    await expect(panel, 'panel postępów jest w karcie').toBeVisible();
    await expect(panel.locator('svg.vilda-pd-svg-masa'), 'z wykresem masy').toBeVisible();
    await expect(page.locator('.vilda-patient-tab-content[data-tab="traj"]'))
      .not.toContainText('Siatki centylowe dostępne tylko dla dzieci');

    const tekst = (await panel.textContent()) || '';
    expect(tekst, 'ostatnia masa').toContain('88,6');
    expect(tekst, 'masa przy punkcie odniesienia').toContain('112,4');
  });

  test('POSTEPY-2: dziecko nadal dostaje siatki, nie wykres postępów', async ({ page }) => {
    // Kontrola negatywna wbudowana w zestaw: rata 2 nie może podmienić zakładki dzieciom.
    await otworzZKontem(page);
    const pid = await zalozPacjenta(page, {
      imie: 'Postepy-Dziecko', wiekLat: 9,
      pomiary: [
        { ageYears: 9, ageMonths: 108, height: 134, weight: 42 },
        { ageYears: 9.5, ageMonths: 114, height: 137, weight: 44 },
      ],
    });
    const etykieta = await otworzZakladkeTraj(page, pid);

    expect(etykieta).toContain('Siatki centylowe');
    await expect(page.locator('.vilda-pd-host')).toHaveCount(0);
  });

  test('POSTEPY-3: wykres bierze punkty leczenia, których nie zna oś czasu', async ({ page }) => {
    // Sedno raty: `obesityTherapyPoints` NIE trafiają do osi czasu pacjenta (sejf czyta
    // tylko ghTherapyPoints). Pacjent z pomiarami wyłącznie w monitorze otyłości musi mimo
    // to zobaczyć wykres — i to z datami, które tamte punkty niosą.
    await otworzZKontem(page);
    const punkt = (typ, dateISO, masa, mies) => ({
      id: typ + dateISO, type: typ, ageYears: 52, ageMonths: mies,
      weight: masa, height: 170, bmi: +(masa / 2.89).toFixed(1),
      dose: '3,0 mg / dobę', dateISO,
      drug: 'Saxenda (liraglutyd) – s.c. 1×/dobę', substance: 'liraglutide',
    });
    const pid = await zalozPacjenta(page, {
      imie: 'Postepy-Monitor', wiekLat: 52,
      pomiary: [{ ageYears: 52, ageMonths: 624, height: 170, weight: 120 }],
      punkty: [
        punkt('start', '2026-01-05', 120, 0),
        punkt('continue', '2026-04-27', 110, 3),
        punkt('continue', '2026-07-20', 104, 6),
      ],
    });
    await otworzZakladkeTraj(page, pid);

    const panel = page.locator('.vilda-pd-host');
    await expect(panel).toBeVisible();
    const tekst = (await panel.textContent()) || '';
    expect(tekst, 'masa z punktu włączenia').toContain('120,0');
    expect(tekst, 'ostatnia masa z monitora').toContain('104,0');
    expect(tekst, 'data z punktu leczenia, nie z osi czasu').toContain('05.01.2026');
    expect(tekst, 'punkt oceny wg ChPL dla liraglutydu').toContain('nominalnym czasie zwiększania dawki');
  });

  test('POSTEPY-4: dorosły z jednym pomiarem dostaje wyjaśnienie, nie pusty ekran', async ({ page }) => {
    await otworzZKontem(page);
    const pid = await zalozPacjenta(page, {
      imie: 'Postepy-Jeden', wiekLat: 47,
      pomiary: [{ ageYears: 47, ageMonths: 564, height: 167, weight: 112.4 }],
    });
    await otworzZakladkeTraj(page, pid);

    await expect(page.locator('.vilda-pd-host')).toHaveCount(0);
    await expect(page.locator('.vilda-patient-tab-content[data-tab="traj"]'))
      .toContainText('po dwóch pomiarach masy ciała');
  });

  test('POSTEPY-5: na telefonie wykres nie wywołuje poziomego przewijania', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await otworzZKontem(page);
    const pid = await zalozPacjenta(page, { imie: 'Postepy-Mobile', wiekLat: 47, pomiary: POMIARY_DOROSLY });
    await otworzZakladkeTraj(page, pid);
    await expect(page.locator('.vilda-pd-host svg.vilda-pd-svg-masa')).toBeVisible();
    await expect(page.locator('.vilda-pd-host svg.vilda-pd-svg-bmi')).toBeVisible();

    const przewija = await page.evaluate(() =>
      document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
    expect(przewija, 'brak poziomego przewijania (AGENTS.md §6)').toBe(false);
  });

  test('POSTEPY-6: wykres BMI ze strefami klas i lista kamieni milowych', async ({ page }) => {
    // Rata 3 na prawdziwej stronie. Pacjent z odzyskiem masy, żeby kamienie objęły
    // i poprawę, i pogorszenie.
    await otworzZKontem(page);
    const pid = await zalozPacjenta(page, {
      imie: 'Postepy-BMI', wiekLat: 52,
      pomiary: [
        { ageYears: 52, ageMonths: 624, height: 170, weight: 120, dateISO: '2026-01-01' },
        { ageYears: 52.3, ageMonths: 627, height: 170, weight: 108, dateISO: '2026-04-02' },
        { ageYears: 52.5, ageMonths: 630, height: 170, weight: 100, dateISO: '2026-07-02' },
        { ageYears: 52.8, ageMonths: 633, height: 170, weight: 114, dateISO: '2026-10-01' },
      ],
    });
    await otworzZakladkeTraj(page, pid);

    const panel = page.locator('.vilda-pd-host');
    await expect(panel).toBeVisible();
    await expect(panel.locator('svg.vilda-pd-svg'), 'dwa wykresy: masa i BMI').toHaveCount(2);
    await expect(panel.locator('svg.vilda-pd-svg-bmi')).toBeVisible();
    await expect(panel, 'nagłówek wykresu BMI').toContainText('BMI i klasy masy ciała');

    const tekst = (await panel.textContent()) || '';
    expect(tekst, 'nazwa klasy ze strefy').toContain('Otyłość');
    expect(tekst, 'lista kamieni').toContain('Kamienie milowe');
    expect(tekst, 'osiągnięte pasmo').toContain('Ubytek sięgnął 5 % masy');
    expect(tekst, 'nadir z liczbą sformatowaną po polsku').toContain('100,0 kg');
    expect(tekst, 'i odzysk').toContain('Odzyskano ponad 25 %');

    const kamieni = await panel.locator('.vilda-pd-mile').count();
    expect(kamieni, 'kilka wierszy na osi wydarzeń').toBeGreaterThan(3);
  });

  test('POSTEPY-7: pacjent bez wzrostu dostaje wykres masy, ale nie BMI', async ({ page }) => {
    // Wizyta z samą masą zostaje w serii (rata 2). BMI dla niej nie istnieje, więc drugiego
    // wykresu nie ma — zamiast pustej ramki albo osi bez linii.
    await otworzZKontem(page);
    const pid = await zalozPacjenta(page, {
      imie: 'Postepy-BezWzrostu', wiekLat: 47,
      pomiary: [
        { ageYears: 47, ageMonths: 564, weight: 112.4, dateISO: '2026-01-08' },
        { ageYears: 47.7, ageMonths: 572, weight: 101.0, dateISO: '2026-09-10' },
      ],
    });
    await otworzZakladkeTraj(page, pid);

    const panel = page.locator('.vilda-pd-host');
    await expect(panel).toBeVisible();
    await expect(panel.locator('svg.vilda-pd-svg'), 'tylko wykres masy').toHaveCount(1);
    await expect(panel.locator('svg.vilda-pd-svg-masa')).toHaveCount(1);
    await expect(panel.locator('svg.vilda-pd-svg-bmi')).toHaveCount(0);
    await expect(panel).not.toContainText('BMI i klasy masy ciała');
  });
});

test.describe('P-PDF — wydruk postępów jako prawdziwy PDF', () => {
  // Po zgłoszeniu właściciela: na iPhonie w trybie PWA oba przyciski nie robiły nic, bo iOS
  // w trybie standalone ignoruje `<a download>` i nie ma okna druku. Wydruk idzie teraz przez
  // pdfmake ładowany LENIWIE z plików w repozytorium (są w precache, więc działa offline).
  //
  // Ten test na prawdziwej stronie dowodzi trzech rzeczy naraz: że biblioteka wstaje z tych
  // plików, że powstaje plik PDF, i że trafia do pobrania pod właściwą nazwą.
  const PUNKT = (typ, dateISO, masa, mies) => ({
    id: typ + dateISO, type: typ, ageYears: 52, ageMonths: mies,
    weight: masa, height: 170, bmi: +(masa / 2.89).toFixed(1),
    dose: '3,0 mg / dobę', dateISO,
    drug: 'Saxenda (liraglutyd) – s.c. 1×/dobę', substance: 'liraglutide',
  });

  async function kartaZWydrukiem(page, imie) {
    await otworzZKontem(page);
    const pid = await zalozPacjenta(page, {
      imie, wiekLat: 52,
      pomiary: [{ ageYears: 52, ageMonths: 624, height: 170, weight: 120, dateISO: '2026-01-05' }],
      punkty: [
        PUNKT('start', '2026-01-05', 120, 0),
        PUNKT('continue', '2026-04-27', 110, 3),
        PUNKT('continue', '2026-07-20', 104, 6),
      ],
    });
    await otworzZakladkeTraj(page, pid);
    await expect(page.locator('.vilda-pd-host')).toBeVisible();
    return pid;
  }

  test('POSTEPY-8: oba warianty mają przyciski opisujące, co naprawdę zrobią', async ({ page }) => {
    await kartaZWydrukiem(page, 'Postepy-PDF');
    const panel = page.locator('.vilda-pd-host');

    await expect(panel).toContainText('Wydruk');
    await expect(panel).toContainText('Dla pacjenta');
    await expect(panel).toContainText('Do dokumentacji');
    await expect(panel.locator('[data-akcja="zapisz"]'), 'zapis dla obu wariantów').toHaveCount(2);
    await expect(panel.locator('[data-akcja="drukuj"]'), 'druk dla obu wariantów').toHaveCount(2);
    await expect(panel.locator('[data-akcja="zapisz"]').first()).toContainText('PDF');
    await expect(panel, 'podpowiedź prowadzi do PDF').toContainText('Zapisz jako PDF');
    await expect(panel.locator('.vilda-pd-akcje-stan'), 'jest gdzie napisać, co się stało').toHaveCount(1);
  });

  test('POSTEPY-9: „Zapisz PDF" pobiera prawdziwy plik PDF', async ({ page }) => {
    await kartaZWydrukiem(page, 'Postepy-PDF-Zapis');
    const panel = page.locator('.vilda-pd-host');

    const [pobranie] = await Promise.all([
      page.waitForEvent('download', { timeout: 30000 }),
      panel.locator('[data-akcja="zapisz"][data-wariant="kliniczny"]').click(),
    ]);
    const nazwa = pobranie.suggestedFilename();
    expect(nazwa, 'wariant i rozszerzenie w nazwie').toMatch(/^postepy_kliniczny_.*\.pdf$/);

    const strumien = await pobranie.createReadStream();
    const kawalki = [];
    for await (const k of strumien) kawalki.push(k);
    const plik = Buffer.concat(kawalki);
    expect(plik.slice(0, 5).toString(), 'to naprawdę PDF').toBe('%PDF-');
    expect(plik.length, 'z treścią, nie pusty').toBeGreaterThan(5000);

    await expect(panel.locator('.vilda-pd-akcje-stan'), 'i panel mówi, że się udało')
      .toContainText('Zapisano');
  });

  test('POSTEPY-11: gdy biblioteka nie wstanie, panel MÓWI dlaczego — cisza była sednem usterki', async ({ page }) => {
    // Na iPhonie przyciski nie robiły nic i nic nie mówiły: funkcje zwracały `false`, a
    // wiązanie połykało wyjątki. Nawet gdy coś się nie uda, lekarz ma to przeczytać, a nie
    // zastanawiać się, czy w ogóle kliknął.
    //
    // Awarię wymuszamy REALNĄ drogą — blokadą żądań do plików pdfmake, czyli dokładnie tym,
    // co się dzieje bez sieci i bez precache. Podmiana API nie wchodzi w grę i nie powinna:
    // moduł jest zamrożony (`Object.freeze`), więc test nie ma jak oszukać produktu.
    await kartaZWydrukiem(page, 'Postepy-PDF-Cisza');
    await page.route('**/pdfmake*', (r) => r.abort());

    const panel = page.locator('.vilda-pd-host');
    const stan = panel.locator('.vilda-pd-akcje-stan');
    await panel.locator('[data-akcja="zapisz"][data-wariant="pacjent"]').click();

    await expect(stan, 'powód widoczny na ekranie').toContainText('Nie udało się wczytać', { timeout: 20000 });
    await expect(stan, 'i oznaczony jako błąd').toHaveAttribute('data-rodzaj', 'blad');
    await expect(panel.locator('[data-akcja="zapisz"][data-wariant="pacjent"]'),
      'przycisk wraca do użycia').toBeEnabled();
  });

  test('POSTEPY-10: pdfmake wstaje z plików aplikacji, nie z CDN', async ({ page }) => {
    // Gwarancja offline: biblioteka ma się doładować z adresów, które service worker trzyma
    // w precache. Jedno żądanie do CDN i wydruk przestaje działać bez internetu.
    //
    // PIERWSZA WERSJA TEGO TESTU BYŁA ZA SZEROKA i padała w CI: zbierała WSZYSTKIE żądania
    // spoza serwera testowego, a aplikacja sama z siebie odpytuje w tle status slotu
    // synchronizacji. To żądanie nie ma nic wspólnego z wydrukiem, raz zdąży w oknie pomiaru,
    // raz nie — stąd zielono lokalnie i czerwono w CI. Pytamy więc wyłącznie o żądania
    // dotyczące pdfmake, bo tylko o nie w tym teście chodzi.
    await kartaZWydrukiem(page, 'Postepy-PDF-Offline');
    const zadaniaPdfmake = [];
    page.on('request', (r) => { if (/pdfmake/i.test(r.url())) zadaniaPdfmake.push(r.url()); });

    await page.locator('.vilda-pd-host [data-akcja="zapisz"][data-wariant="pacjent"]').click()
      .catch(() => { /* pobranie obsłuży przeglądarka */ });
    await expect.poll(() => page.evaluate(() => Boolean(window.pdfMake && window.pdfMake.vfs)),
      { timeout: 30000 }).toBe(true);

    expect(zadaniaPdfmake.length, 'biblioteka naprawdę się doładowała').toBeGreaterThan(0);
    for (const u of zadaniaPdfmake) {
      expect(u, 'z serwera aplikacji, nie z CDN').toMatch(/^http:\/\/(localhost|127\.0\.0\.1)[:/]/);
    }
  });
});
