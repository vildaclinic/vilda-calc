import { expect, test } from '../support/test-czas.mjs';

// GROWTH-HV-3 — HV-SDS w trzech miejscach wskazanych przez właściciela (2026-09-09):
//   1. karta „Podsumowanie wyników" — jedno zdanie pod tempem wzrastania;
//   2. karta „Zaawansowane obliczenia wzrostowe" — kafelek obok wzrostu, masy i BMI;
//   3. Karta pacjenta, zakładka Status — kafelek rozwijalny o komplet opisu pomiaru.
//
// Ten plik istnieje z powodu konkretnej pomyłki: w SW 1.0.870 blok HV-SDS trafił do
// buildHtml(), czyli do gałęzi, której aplikacja nie renderuje. Testy jednostkowe były
// zielone, bo wołały tamtą funkcję wprost. Tutaj patrzymy wyłącznie na to, co realnie
// pojawia się na ekranie.
test.use({ serviceWorkers: 'block' });

const HASLO = 'E2e#HvTrzy!26aa';

async function otworz(page) {
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
}

// Rozwinięcie panelu „Dane pokwitaniowe" — domyślnie jest zwinięty.
async function rozwinPanel(page) {
  const btn = page.getByRole('button', { name: '+ Dane pokwitaniowe' });
  if (await btn.count()) await btn.click();
  await expect(page.locator('#tannerStage')).toBeVisible();
}

// Dziewczynka 10 lat, 135 cm; rok wcześniej 128 cm → 7,0 cm/rok.
//
// Karta zaawansowana podpina uchwyt przycisku LENIWIE (xa() w vilda_advanced_growth.js)
// i dopiero wtedy tworzy pierwszy wiersz pomiarowy. Klik przed podpięciem nie robi nic,
// a wiersza jeszcze nie ma — na obciążonym runnerze to wywracało dwa z sześciu testów.
// Dlatego czekamy na znacznik, który aplikacja sama stawia w DOM, zamiast na upływ czasu.
async function policzPacjentke(page) {
  await page.evaluate(() => {
    document.getElementById('age').value = '10';
    document.getElementById('sex').value = 'F';
    document.getElementById('height').value = '135';
    document.getElementById('weight').value = '30';
    if (typeof window.update === 'function') window.update();
  });
  await page.waitForSelector(
    '#toggleAdvancedGrowth[data-vilda-advanced-growth-toggle-attached="true"]',
    { state: 'attached' },
  );
  // Przycisk bywa wyłączony bramką trybu — tu mierzymy zawartość karty, nie bramkę.
  await page.evaluate(() => {
    const t = document.getElementById('toggleAdvancedGrowth');
    if (t) { t.disabled = false; t.click(); }
  });
  await expect(page.locator('#advancedGrowthForm'), 'karta zaawansowana się odsłoniła')
    .toBeVisible();
  await page.waitForSelector('#advMeasurements .measure-row');

  await page.evaluate(() => {
    const w = document.querySelector('#advMeasurements .measure-row');
    const set = (sel, v) => {
      const e = w.querySelector(sel);
      if (e) { e.value = v; e.dispatchEvent(new Event('input', { bubbles: true })); }
    };
    set('.adv-age-years', '9');
    set('.adv-height', '128');
    set('.adv-weight', '27');
    if (typeof window.calculateGrowthAdvanced === 'function') window.calculateGrowthAdvanced();
  });
  await page.waitForSelector('#advResults .vtap');
}

test.describe('Karta „Zaawansowane obliczenia wzrostowe”', () => {
  test('kafelek SDS tempa stoi w tym samym rzędzie co wzrost, masa i BMI', async ({ page }) => {
    await otworz(page);
    await policzPacjentke(page);

    const kafelki = await page.evaluate(() => [...document.querySelectorAll('#advResults .vtap-cards > .vtap-card')]
      .map((c) => (c.innerText || '').split('\n')[0].trim()));
    expect(kafelki, 'kafelek dołącza do istniejącego rzędu, a nie stoi osobno')
      .toEqual(expect.arrayContaining(['WZROST', 'WAGA', 'BMI', 'SDS TEMPA']));  // CSS: wersaliki

    const hv = page.locator('#advResults .vtap-cards .vtap-hvc');
    await expect(hv).toBeVisible();
    await expect(hv, 'źródło podpisane jak w piśmiennictwie')
      .toContainText('wg Duran i wsp., J Pediatr Endocrinol Metab 2025');
    await expect(hv, 'w karcie zaawansowanej kafelek jest zwięzły').not.toContainText('2,8 SD');
  });

  test('werdykt tempa zostaje nietknięty obok kafelka', async ({ page }) => {
    await otworz(page);
    await policzPacjentke(page);
    await expect(page.locator('#advResults .vtap-tempo')).toContainText('cm/rok');
    await expect(page.locator('#advResults .vtap-tempo')).toContainText('7,0');
  });
});

test.describe('Karta „Podsumowanie wyników”', () => {
  test('jedno zdanie zaraz pod tempem wzrastania, bez HTML-a', async ({ page }) => {
    await otworz(page);
    await policzPacjentke(page);

    // Treść karty składa generateMetabolicSummary() — to ona jest źródłem wierszy
    // (.current-summary-row powstają z niej przez textContent). Sama karta bywa ukryta
    // zależnie od trybu, więc mierzymy zawartość, a nie widoczność kontenera.
    const linie = await page.evaluate(() => String(window.generateMetabolicSummary() || '')
      .split('\n').map((t) => t.trim()).filter(Boolean));
    const iTempo = linie.findIndex((t) => /tempo wzrastania/i.test(t));
    const iHv = linie.findIndex((t) => /^SDS tempa/.test(t));

    expect(iTempo, 'wiersz tempa jest w podsumowaniu').toBeGreaterThan(-1);
    expect(iHv, 'wiersz SDS tempa jest w podsumowaniu').toBeGreaterThan(-1);
    expect(iHv, 'i stoi zaraz pod tempem').toBe(iTempo + 1);
    expect(linie[iHv]).toContain('centyl');
    expect(linie[iHv]).toContain('wg Duran i wsp., J Pediatr Endocrinol Metab 2025');
    expect(linie[iHv], 'karta składa wiersze przez textContent — żadnego HTML-a')
      .not.toMatch(/[<>]/);
  });

  test('kontrola negatywna: bez pomiaru wcześniejszego nie ma ani tempa, ani SDS', async ({ page }) => {
    await otworz(page);
    await page.evaluate(() => {
      document.getElementById('age').value = '10';
      document.getElementById('sex').value = 'F';
      document.getElementById('height').value = '135';
      document.getElementById('weight').value = '30';
      if (typeof window.update === 'function') window.update();
    });
    const tekst = await page.evaluate(() => String(window.generateMetabolicSummary() || ''));
    expect(tekst).not.toMatch(/SDS tempa/);
  });
});

test.describe('Karta pacjenta, zakładka „Siatki centylowe”', () => {
  // Decyzja właściciela 2026-09-09: tu kafelek nie jest klikalny ani rozwijalny —
  // szczegóły są pod kafelkiem w zakładce „Status".
  test('kafelek jest zwięzły: liczba, centyl, mediana i źródło — bez rozwijania', async ({ page }) => {
    await otworz(page);
    const html = await page.evaluate(() => {
      const model = window.VildaTrajectoryAnalysis.analyze({
        sex: 'K',
        currentAgeMonths: 120,
        measurements: [
          { ageMonths: 108, height: 128, weight: 27 },
          { ageMonths: 120, height: 135, weight: 30 },
        ],
        source: 'OLAF',
      });
      return window.VildaTrajectoryAnalysis.buildPatientHtml(model, { hvRozwijalny: true });
    });
    expect(html).toContain('vtap-hvc');
    expect(html, 'kafelek bez własnego rozwijania').not.toContain('<details class="vtap-hv"');
    expect(html).not.toMatch(/rozwiń szczegóły/);
    expect(html).not.toMatch(/Populacja odniesienia/);
    expect(html).toMatch(/mediana \d+,\d\d cm\/rok/);
    expect(html).toMatch(/wg Duran i wsp\., J Pediatr Endocrinol Metab 2025/);
  });

  test('Karta pacjenta i karta zaawansowana dostają ten sam zwięzły kafelek', async ({ page }) => {
    await otworz(page);
    const wynik = await page.evaluate(() => {
      const model = window.VildaTrajectoryAnalysis.analyze({
        sex: 'K',
        currentAgeMonths: 120,
        measurements: [
          { ageMonths: 108, height: 128, weight: 27 },
          { ageMonths: 120, height: 135, weight: 30 },
        ],
        source: 'OLAF',
      });
      return {
        pacjent: window.VildaTrajectoryAnalysis.buildPatientHtml(model),
        karta: window.VildaTrajectoryAnalysis.buildCardPanelHtml(model),
      };
    });
    const kafelek = (h) => (h.match(/<div class="vtap-card cs vtap-hvc">.*?<\/div><\/div>/s) || [''])[0];
    expect(kafelek(wynik.pacjent)).toContain('vtap-hvc');
    expect(kafelek(wynik.pacjent), 'ten sam kafelek w obu miejscach').toBe(kafelek(wynik.karta));
  });
});

test.describe('Wynik przelicza się na żywo', () => {
  // Zgłoszenie właściciela: „czy zaznaczę Tanner I czy Tanner V, to widzę ten sam wynik".
  // Przyczyna: pola pokwitaniowe nie były na liście wejść, których zmiana odświeża kartę.
  test('zmiana stadium Tannera natychmiast zmienia werdykt tempa', async ({ page }) => {
    await otworz(page);
    await policzPacjentke(page);
    await rozwinPanel(page);
    const tempo = page.locator('#advResults .vtap-tempo');
    await expect(tempo).toContainText('w normie');

    await page.locator('#tannerStage').selectOption('5');
    await expect(tempo, 'po skoku pokwitaniowym norma tempa nie ma zastosowania')
      .toContainText('po skoku pokwitaniowym');
    await expect(tempo).not.toContainText('w normie');
  });

  test('wpisanie wieku startu pokwitania dokłada podgrupę bez przeładowania', async ({ page }) => {
    await otworz(page);
    await policzPacjentke(page);
    await rozwinPanel(page);
    const kafelek = page.locator('#advResults .vtap-hvc');
    await expect(kafelek).not.toContainText('Wg czasu pokwitania');

    await page.locator('#pubertyOnsetAge').fill('12.5');
    await expect(kafelek).toContainText('Wg czasu pokwitania');
    await expect(kafelek).toContainText('dzieci dojrzewające później');
  });

  test('deklaracja KOWD dokłada gałąź do zdania w podsumowaniu', async ({ page }) => {
    await otworz(page);
    await policzPacjentke(page);
    await rozwinPanel(page);
    const zdanie = () => page.evaluate(() => String(window.generateMetabolicSummary() || '')
      .split('\n').find((t) => /^SDS tempa/.test(t.trim())) || '');
    expect(await zdanie()).not.toMatch(/KOWD/);

    await page.locator('#pubertyCdgp').selectOption('tak');
    await page.waitForFunction(() => String(window.generateMetabolicSummary() || '').includes('KOWD'));
    expect(await zdanie()).toMatch(/KOWD/);
  });
});

test.describe('Zdanie w podsumowaniu przeżywa niegotową globalną', () => {
  // Zgłoszenie właściciela: po wczytaniu pacjenta zdanie o SDS tempa bywało nieobecne,
  // a pojawiało się dopiero po odświeżeniu strony. Zdanie wisiało na `advancedGrowthData`,
  // która tuż po wczytaniu bywa jeszcze niewypełniona.
  test('brak wieku i pomiarów w globalnej nie kasuje zdania', async ({ page }) => {
    await otworz(page);
    await policzPacjentke(page);
    const zdanie = () => page.evaluate(() => String(window.generateMetabolicSummary() || '')
      .split('\n').find((t) => /^SDS tempa/.test(t.trim())) || '');
    expect(await zdanie(), 'punkt wyjścia').toMatch(/centyl/);

    // Stan, w jakim bywa karta tuż po wczytaniu pacjenta.
    await page.evaluate(() => {
      const C = window.advancedGrowthData || {};
      window.advancedGrowthData = {
        growthVelocity: C.growthVelocity,
        growthVelocityUsedLastYear: true,
        growthVelocityGapM: C.growthVelocityGapM,
        sex: C.sex,
      };
    });
    expect(await zdanie(), 'zdanie powstaje z pomiarów w formularzu').toMatch(/centyl/);
  });
});

test.describe('Karta pacjenta — kafelek w zakładce Status', () => {
  // Do SW 1.0.871 kafelek powstawał wyłącznie w panelu trajektorii, a ten mieszka
  // w INNEJ zakładce Karty pacjenta — więc w „Statusie" nie było go widać w ogóle.
  // Dlatego test patrzy na widoczną zakładkę, nie na obecność węzła w DOM.
  test('kafelek stoi w siatce statystyk i daje się rozwinąć', async ({ page }) => {
    await otworz(page);
    const patientId = await page.evaluate(async () => {
      const w = await window.VildaVault.savePatient({
        name: 'Testowa Ala',
        user: {
          lastName: 'Testowa', firstName: 'Ala', sex: 'K',
          age: 10, ageMonths: 0, height: 135, weight: 30,
        },
        growthBasic: {
          data: {
            measurements: [
              { ageMonths: 108, ageYears: 9, height: 128, weight: 27 },
              { ageMonths: 120, ageYears: 10, height: 135, weight: 30 },
            ],
          },
        },
      }, { dedup: false });
      return w.patientId;
    });
    await page.evaluate((id) => window.VildaAuthUI.showPatientCard(id), patientId);

    const kafelek = page.locator('.vhv-tile');
    await expect(kafelek, 'kafelek jest WIDOCZNY, nie tylko obecny w DOM').toBeVisible();
    await expect(kafelek).toContainText('SDS tempa');
    await expect(kafelek, 'podpis źródła nie stoi na kafelku (decyzja właściciela)')
      .not.toContainText('wg Duran');
    await expect(kafelek, 'centyl do jedności').not.toContainText(/\d,\d centyl/);
    await expect(kafelek, 'ta sama klasa wyglądu co wzrost, masa i BMI')
      .toHaveClass(/vilda-patient-stat--ok/);

    // Kafelek stoi w tej samej siatce co wzrost, masa i BMI.
    const etykiety = await page.evaluate(() => {
      const pane = [...document.querySelectorAll('.vilda-patient-tab-content')]
        .find((x) => !x.classList.contains('vilda-patient-tab-content--hidden'));
      return [...pane.querySelectorAll('.vilda-patient-stat-label')]
        .map((t) => (t.textContent || '').trim());
    });
    expect(etykiety).toEqual(expect.arrayContaining(['Wzrost', 'Waga', 'BMI', 'SDS tempa']));

    // Szczegóły otwierają się w panelu POD siatką — kafelek nie może się rozciągać
    // w dół ani ciągnąć za sobą sąsiadów (zgłoszenie właściciela).
    const wysokosciPrzed = await page.evaluate(() => [...document.querySelectorAll(
      '.vilda-patient-tab-content:not(.vilda-patient-tab-content--hidden) .vilda-patient-stat',
    )].map((t) => Math.round(t.getBoundingClientRect().height)));

    await kafelek.click();
    const panel = page.locator('.vhv-panel');
    await expect(panel).toBeVisible();
    await expect(panel, 'cytowanie z PMID jest w rozwinięciu').toContainText('Duran I');
    await expect(panel).toContainText('PMID 40557842');
    await expect(panel).toContainText('Odstęp pomiarów');
    await expect(panel).toContainText('2,8 SD');
    expect(await page.evaluate(() => Boolean(
      document.querySelector('.vhv-panel').closest('.vilda-patient-stats-grid'),
    )), 'panel stoi poza siatką kafelków').toBe(false);

    const wysokosciPo = await page.evaluate(() => [...document.querySelectorAll(
      '.vilda-patient-tab-content:not(.vilda-patient-tab-content--hidden) .vilda-patient-stat',
    )].map((t) => Math.round(t.getBoundingClientRect().height)));
    expect(wysokosciPo, 'żaden kafelek nie zmienił wysokości').toEqual(wysokosciPrzed);
  });
});

test.describe('Ten sam pacjent — ta sama liczba w każdym miejscu', () => {
  // Zgłoszenie właściciela (SW 1.0.874): Karta pacjenta „+2,2 · 98,6 centyl" (dziś: 99), a „Podsumowanie
  // wyników" tego samego pacjenta „−2,5 (0,6 centyl)". Ujawnia się dopiero przy DWÓCH pomiarach
  // historycznych: zdanie podsumowania liczyło wtedy tempo z samej historii, bez pomiaru
  // dzisiejszego. Dlatego ten test ma dwa wiersze, a nie jeden jak pozostałe.
  //
  // Chłopiec 9 lat 8 mies., 129,5 cm; rok temu 122 cm (7,5 cm/rok); dwa lata temu 116 cm.
  // Na CI pierwsza wersja tej funkcji wywracała się na ukrytych wierszach pomiarowych:
  // pola wypełniane przez `fill` kolejkują opóźnione przeliczenia, a klik w przełącznik
  // karty jest PRZEŁĄCZNIKIEM — trafiony w złym momencie zamyka kartę zamiast ją otworzyć.
  // Dlatego: nazwisko i imię przez `fill` (bramka zapisu ich wymaga), reszta jak w
  // policzPacjentke — wartości plus synchroniczne update(), odczekanie dwóch klatek,
  // a po kliknięciu jawne sprawdzenie, że karta jest otwarta.
  async function policzChlopca(page) {
    await page.fill('#lastName', 'Probny');
    await page.fill('#firstName', 'Jedrek');
    await page.evaluate(() => {
      const set = (id, v) => {
        const e = document.getElementById(id);
        e.value = v;
        e.dispatchEvent(new Event('input', { bubbles: true }));
        e.dispatchEvent(new Event('change', { bubbles: true }));
      };
      set('age', '9'); set('ageMonths', '8'); set('sex', 'M');
      set('height', '129.5'); set('weight', '27.6');
      if (typeof window.update === 'function') window.update();
    });
    await page.evaluate(() => new Promise((r) => { requestAnimationFrame(() => { requestAnimationFrame(r); }); }));
    await page.waitForSelector(
      '#toggleAdvancedGrowth[data-vilda-advanced-growth-toggle-attached="true"]',
      { state: 'attached' },
    );
    await page.evaluate(() => {
      const t = document.getElementById('toggleAdvancedGrowth');
      const f = document.getElementById('advancedGrowthForm');
      if (f && getComputedStyle(f).display !== 'none') return; // już otwarta — nie zamykaj
      if (t) { t.disabled = false; t.click(); }
    });
    await expect(page.locator('#advancedGrowthForm'), 'karta zaawansowana się odsłoniła')
      .toBeVisible();
    await page.waitForSelector('#advMeasurements .measure-row');
    await page.evaluate(() => { window.addAdvMeasurementRow(); });
    await page.evaluate(() => {
      const rows = document.querySelectorAll('#advMeasurements .measure-row');
      const set = (w, sel, v) => {
        const e = w.querySelector(sel);
        if (e) { e.value = v; e.dispatchEvent(new Event('input', { bubbles: true })); }
      };
      set(rows[0], '.adv-age-years', '7'); set(rows[0], '.adv-age-months', '8');
      set(rows[0], '.adv-height', '116'); set(rows[0], '.adv-weight', '22');
      set(rows[1], '.adv-age-years', '8'); set(rows[1], '.adv-age-months', '8');
      set(rows[1], '.adv-height', '122'); set(rows[1], '.adv-weight', '25');
      window.calculateGrowthAdvanced();
    });
    await page.waitForSelector('#advResults .vtap-hvc');
  }

  const zdanie = (page) => page.evaluate(() => String(window.generateMetabolicSummary() || '')
    .split('\n').find((t) => /^SDS tempa/.test(t.trim())) || '');

  test('przy dwóch pomiarach historycznych podsumowanie i kafelek karty mówią to samo', async ({ page }) => {
    await otworz(page);
    await policzChlopca(page);
    await expect(page.locator('#advResults .vtap-hvc')).toContainText('+2,2');
    const z = await zdanie(page);
    expect(z, 'ta sama liczba co w kafelku').toContain('+2,2');
    expect(z).toContain('99 centyl');
    expect(z).not.toMatch(/nie policzono/);
  });

  test('po „Wczytaj tego pacjenta” i wpisaniu dzisiejszych danych zdanie zgadza się z kafelkiem Statusu', async ({ page }) => {
    await otworz(page);
    await policzChlopca(page);
    await page.locator('#saveDataBtnSidebar').click();
    await page.waitForFunction(async () => (await window.VildaVault.listPatients()).length === 1);
    const pid = await page.evaluate(async () => (await window.VildaVault.listPatients())[0].patientId);

    // Karta zaawansowana zapamiętuje wynik; nowy formularz zaczyna od zera jak u lekarza.
    await page.evaluate(() => window.clearAllData());
    // Karta pacjenta otwierana tak, jak robi to powłoka: z uchwytem wczytującym rekord.
    await page.evaluate((id) => window.VildaAuthUI.showPatientCard(id, (rekord) => {
      if (rekord) window.applyLoadedData(rekord);
    }, null), pid);
    const kafelek = page.locator('.vhv-tile');
    await expect(kafelek).toBeVisible();
    await expect(kafelek).toContainText('+2,2');
    await expect(kafelek).toContainText('99 centyl');

    await page.getByRole('button', { name: 'Wczytaj tego pacjenta' }).click();
    await page.waitForFunction(() => !document.querySelector('.vilda-auth-screen'));
    // Wczytanie zostawia wiek, masę i wzrost puste — to dzisiejszy pomiar, lekarz wpisuje go sam.
    await page.fill('#age', '9');
    await page.fill('#ageMonths', '8');
    await page.fill('#height', '129.5');
    await page.fill('#weight', '27.6');
    await page.waitForFunction(() => /SDS tempa/.test(String(window.generateMetabolicSummary() || '')));
    const z = await zdanie(page);
    expect(z, 'bez odświeżania strony i z tą samą liczbą co w Karcie pacjenta').toContain('+2,2');
    expect(z).toContain('99 centyl');
  });

  // Druga ścieżka wskazana przez właściciela: po „Wczytaj tego pacjenta" wybiera
  // „Odtwórz zapis" (modal „Co chcesz zrobić?" z custom-fixes.js), a nie „Nowy pomiar".
  // Formularz wraca wtedy z rekordu w całości — z ostatnim pomiarem i kartą podsumowania —
  // i zdanie o SDS tempa ma tam stać od razu, bez odświeżania strony, z tą samą liczbą
  // co w Karcie pacjenta. Przed poprawką na tej ścieżce stało „nie policzono" albo liczba
  // z niewłaściwej pary punktów, zależnie od odstępów w historii.
  test('po „Wczytaj tego pacjenta” → „Odtwórz zapis” zdanie stoi od razu i zgadza się z kafelkiem', async ({ page }) => {
    await otworz(page);
    await policzChlopca(page);
    await page.locator('#saveDataBtnSidebar').click();
    await page.waitForFunction(async () => (await window.VildaVault.listPatients()).length === 1);
    const pid = await page.evaluate(async () => (await window.VildaVault.listPatients())[0].patientId);

    await page.evaluate(() => window.clearAllData());
    await page.evaluate((id) => window.VildaAuthUI.showPatientCard(id, (rekord) => {
      if (rekord) window.applyLoadedData(rekord);
    }, null), pid);
    const kafelek = page.locator('.vhv-tile');
    await expect(kafelek).toBeVisible();
    await expect(kafelek).toContainText('+2,2');

    await page.getByRole('button', { name: 'Wczytaj tego pacjenta' }).click();
    await expect(page.locator('#vildaLoadChoiceModal')).toBeVisible();
    await page.locator('#vildaLcmRestore').click();
    await expect(page.locator('#vildaLoadChoiceModal')).toHaveCount(0);
    await expect(page.locator('#height'), 'odtworzenie przywraca ostatni pomiar').toHaveValue('129.5');
    await page.waitForFunction(() => /SDS tempa/.test(String(window.generateMetabolicSummary() || '')));
    const z = await zdanie(page);
    expect(z, 'ta sama liczba co w Karcie pacjenta, bez F5').toContain('+2,2');
    expect(z).toContain('99 centyl');
    expect(z).not.toMatch(/nie policzono/);
  });
});

test.describe('Zdanie stoi także pod drugą gałęzią wiersza tempa', () => {
  // Zgłoszenie właściciela (SW 1.0.877): u pacjenta „Monarcha Jan" Karta pacjenta pokazywała
  // kafelek „SDS tempa +0,5 · 69 centyl · mediana 5,46 cm/rok", a „Podsumowanie wyników" tego
  // samego pacjenta nie miało tego zdania — także po odświeżeniu strony. Rozstrzygający ślad:
  // wiersz tempa brzmiał „Tempo wzrastania: 6,1 cm/rok (obliczono jako średnią z ostatnich
  // 1 lat)", czyli powstał w DRUGIEJ gałęzi, do której HV-SDS nie był dopięty.
  //
  // Odstęp 16 mies. wypada poza okno 9–15 mies. używane przez normę tempa dla wieku
  // (growthVelocityUsedLastYear = false), ale mieści się w oknie DONALD 6–18 mies., więc
  // silnik ma z czego policzyć. Dokładnie ten przypadek odtwarzamy tutaj.
  async function policzJana(page) {
    await page.fill('#lastName', 'Probny');
    await page.fill('#firstName', 'Jan');
    await page.evaluate(() => {
      const set = (id, v) => {
        const e = document.getElementById(id);
        e.value = v;
        e.dispatchEvent(new Event('input', { bubbles: true }));
        e.dispatchEvent(new Event('change', { bubbles: true }));
      };
      set('age', '11'); set('ageMonths', '10'); set('sex', 'M');
      set('height', '143.2'); set('weight', '33.3');
      if (typeof window.update === 'function') window.update();
    });
    await page.evaluate(() => new Promise((r) => { requestAnimationFrame(() => { requestAnimationFrame(r); }); }));
    await page.waitForSelector(
      '#toggleAdvancedGrowth[data-vilda-advanced-growth-toggle-attached="true"]',
      { state: 'attached' },
    );
    await page.evaluate(() => {
      const t = document.getElementById('toggleAdvancedGrowth');
      const f = document.getElementById('advancedGrowthForm');
      if (f && getComputedStyle(f).display !== 'none') return;
      if (t) { t.disabled = false; t.click(); }
    });
    await expect(page.locator('#advancedGrowthForm')).toBeVisible();
    await page.waitForSelector('#advMeasurements .measure-row');
    await page.evaluate(() => {
      const w = document.querySelector('#advMeasurements .measure-row');
      const set = (sel, v) => {
        const e = w.querySelector(sel);
        if (e) { e.value = v; e.dispatchEvent(new Event('input', { bubbles: true })); }
      };
      // 10 lat 6 mies. → odstęp do 11 lat 10 mies. wynosi 16 mies.
      set('.adv-age-years', '10'); set('.adv-age-months', '6');
      set('.adv-height', '135.05'); set('.adv-weight', '30');
      window.calculateGrowthAdvanced();
    });
    await page.waitForSelector('#advResults .vtap-hvc');
  }

  const linie = (page) => page.evaluate(() => String(window.generateMetabolicSummary() || '')
    .split('\n').map((t) => t.trim()).filter(Boolean));

  test('odstęp 16 mies.: wiersz tempa idzie drugą gałęzią, a SDS tempa mimo to jest', async ({ page }) => {
    await otworz(page);
    await policzJana(page);

    const l = await linie(page);
    const iTempo = l.findIndex((t) => /^Tempo wzrastania:/.test(t));
    expect(iTempo, 'to jest ta druga gałąź — bez niej test nie mierzy zgłoszonej usterki')
      .toBeGreaterThan(-1);
    expect(l[iTempo], 'brzmienie drugiej gałęzi').toMatch(/obliczono jako średnią/);
    // Zgłoszenie właściciela (SW 1.0.881): odstęp 16 mies. brzmiał „z ostatnich 1 lat" —
    // nie po polsku, a przy okazji zaokrąglenie gubiło cztery miesiące. Okres stoi w
    // dopełniaczu, bo zdanie zaczyna się od „z", i podaje odstęp, który naprawdę policzono.
    expect(l[iTempo], 'okres po polsku i bez zaokrąglania w dół')
      .toContain('obliczono jako średnią z ostatnich 16 miesięcy');
    expect(l[iTempo]).not.toMatch(/ostatnich 1 lat/);

    const iHv = l.findIndex((t) => /^SDS tempa/.test(t));
    expect(iHv, 'zdanie o SDS tempa jest obecne').toBeGreaterThan(-1);
    expect(iHv, 'i stoi zaraz pod tempem').toBe(iTempo + 1);
    expect(l[iHv]).toContain('+0,5');
    expect(l[iHv]).toContain('68 centyl');
    expect(l[iHv]).toMatch(/wg Duran i wsp\., J Pediatr Endocrinol Metab 2025/);
    expect(l[iHv]).not.toMatch(/nie policzono/);
  });

  test('kafelek karty zaawansowanej i zdanie podsumowania niosą tę samą liczbę', async ({ page }) => {
    await otworz(page);
    await policzJana(page);
    await expect(page.locator('#advResults .vtap-hvc')).toContainText('+0,5');
    await expect(page.locator('#advResults .vtap-hvc')).toContainText('mediana 5,46 cm/rok');
    const l = await linie(page);
    expect(l.find((t) => /^SDS tempa/.test(t))).toContain('+0,5');
  });
});
