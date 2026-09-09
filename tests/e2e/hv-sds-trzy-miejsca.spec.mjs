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

// Dziewczynka 10 lat, 135 cm; rok wcześniej 128 cm → 7,0 cm/rok.
async function policzPacjentke(page) {
  await page.evaluate(() => {
    document.getElementById('age').value = '10';
    document.getElementById('sex').value = 'F';
    document.getElementById('height').value = '135';
    document.getElementById('weight').value = '30';
    if (typeof window.update === 'function') window.update();
    const t = document.getElementById('toggleAdvancedGrowth');
    if (t) { t.disabled = false; t.click(); }
  });
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
    await expect(hv).toContainText('DONALD');
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
    expect(linie[iHv]).toContain('DONALD');
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
