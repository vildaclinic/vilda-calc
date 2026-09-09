import { expect, test } from '../support/test-czas.mjs';

// GROWTH-HV-3 — HV-SDS w trzech miejscach wskazanych przez właściciela (2026-09-09):
//   1. karta „Podsumowanie wyników" — jedno zdanie pod tempem wzrastania;
//   2. karta „Zaawansowane obliczenia wzrostowe" — kafelek obok wzrostu, masy i BMI;
//   3. Karta pacjenta, zakładka Status — ten sam kafelek, rozwijalny.
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

test.describe('Karta pacjenta, zakładka Status', () => {
  test('kafelek jest rozwijalny i niesie komplet opisu pomiaru', async ({ page }) => {
    await otworz(page);
    // Panel Karty pacjenta budowany jest tą samą funkcją, ale z prośbą o wersję rozwijalną.
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
    expect(html).toContain('<details class="vtap-hv"');
    expect(html).toMatch(/Populacja odniesienia: niemiecka/);
    expect(html).toMatch(/2,8 SD/);
  });

  test('Karta pacjenta prosi o wersję rozwijalną, karta zaawansowana o zwięzłą', async ({ page }) => {
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
        pacjent: window.VildaTrajectoryAnalysis.buildPatientHtml(model, { hvRozwijalny: true }),
        karta: window.VildaTrajectoryAnalysis.buildCardPanelHtml(model),
      };
    });
    expect(wynik.pacjent).toContain('<details class="vtap-hv"');
    expect(wynik.karta, 'karta zaawansowana bez rozwijania').not.toContain('<details class="vtap-hv"');
    expect(wynik.karta, 'ale kafelek jest w obu').toContain('vtap-hvc');
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

    const kafelek = page.locator('.vilda-patient-stat-details');
    await expect(kafelek, 'kafelek jest WIDOCZNY, nie tylko obecny w DOM').toBeVisible();
    await expect(kafelek).toContainText('SDS tempa');
    await expect(kafelek).toContainText('wg Duran i wsp., J Pediatr Endocrinol Metab 2025');

    // Kafelek stoi w tej samej siatce co wzrost, masa i BMI.
    const etykiety = await page.evaluate(() => {
      const pane = [...document.querySelectorAll('.vilda-patient-tab-content')]
        .find((x) => !x.classList.contains('vilda-patient-tab-content--hidden'));
      return [...pane.querySelectorAll('.vilda-patient-stat-label')]
        .map((t) => (t.textContent || '').trim());
    });
    expect(etykiety).toEqual(expect.arrayContaining(['Wzrost', 'Waga', 'BMI', 'SDS tempa']));

    await kafelek.locator('summary').click();
    await expect(kafelek).toContainText('PMID 40557842');
    await expect(kafelek).toContainText('Odstęp pomiarów');
    await expect(kafelek).toContainText('2,8 SD');
  });
});
