import { expect, test } from '../support/test-czas.mjs';

// Rata B z audytu sekcji „Pacjenci", znalezisko P3.
//
// Karta pacjenta liczyła centyle w wieku WYLICZONYM Z DATY URODZENIA NA DZIŚ, a wzrost
// i masę brała z ostatniego pomiaru. Im starszy pomiar, tym bardziej rozjechana para
// (wartość, wiek) — i tym niżej wypadał centyl, aż do fałszywego alarmu „<1. centyl".
// Wzrost i masę znamy wyłącznie z chwili pomiaru, więc jedyny uczciwy wiek to wiek
// z tamtej chwili. Data urodzenia służy do czego innego: podpowiada wiek w formularzu
// przy kolejnym pomiarze.
//
// Pomiar musi biec na index.html — `calcPercentileStats` mieszka w app.js, którego
// ustawienia.html nie ładuje (bez niego centyl jest null i test mierzyłby własny artefakt).
//
// Service worker zablokowany: przy pierwszej wizycie instaluje się i robi
// `location.reload()` na `controllerchange`, co przerywa nawigację testu.
test.use({ serviceWorkers: 'block' });

const HASLO = 'E2e#CentylPomiaru!26a';
const WIEK_POMIARU_M = 150; // 12 lat 6 mies.
const WIEK_DZIS_M = 159; //    13 lat 3 mies.

async function otworzZKontem(page) {
  // Bramka regulaminu to modal przechwytujący kliknięcia; akceptacja fikcyjna, na potrzeby testu.
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
  await page.waitForFunction(() => Boolean(window.VildaAuthUI) && typeof window.calcPercentileStats === 'function');
}

// Wzrost dobierany tak, by w WIEKU POMIARU wypadał dokładnie na 50. centylu.
// Nie wpisujemy wartości z tablic — pytamy o nią ten sam silnik, którego używa karta.
async function wzrostNaMedianie(page, wiekMiesiace) {
  return page.evaluate((wiekM) => {
    const centyl = (h, m) => {
      const r = window.calcPercentileStats(h, 'M', m / 12, 'HT');
      return r && r.percentile != null ? r.percentile : null;
    };
    let dol = 100;
    let gora = 200;
    for (let i = 0; i < 60; i += 1) {
      const srodek = (dol + gora) / 2;
      const p = centyl(srodek, wiekM);
      if (p == null) return null;
      if (p < 50) dol = srodek; else gora = srodek;
    }
    return Math.round(((dol + gora) / 2) * 10) / 10;
  }, wiekMiesiace);
}

const centylDla = (page, height, wiekMiesiace) => page.evaluate(({ h, m }) => {
  const r = window.calcPercentileStats(h, 'M', m / 12, 'HT');
  return r && r.percentile != null ? r.percentile : null;
}, { h: height, m: wiekMiesiace });

async function zalozPacjenta(page, { height, wiekLat, wiekMies, wiekDzisM }) {
  return page.evaluate(async (d) => {
    const dzis = new Date();
    // Dzień 1 miesiąca: przy dowolnym dniu „dziś" różnica wychodzi na pełne miesiące.
    const ur = new Date(Date.UTC(dzis.getUTCFullYear(), dzis.getUTCMonth() - d.wiekDzisM, 1));
    const wynik = await window.VildaVault.savePatient({
      name: 'Testowy Pacjent',
      user: {
        lastName: 'Testowy',
        firstName: 'Pacjent',
        sex: 'M',
        dobISO: ur.toISOString().slice(0, 10),
        age: d.wiekLat,
        ageMonths: d.wiekMies,
        height: d.height,
        weight: 42,
      },
    }, { dedup: false });
    return wynik.patientId;
  }, { height, wiekLat, wiekMies, wiekDzisM });
}

async function otworzKarte(page, patientId) {
  await page.evaluate((id) => window.VildaAuthUI.showPatientCard(id), patientId);
  await expect(page.locator('.vilda-patient-stat-label', { hasText: 'Wzrost' })).toBeVisible();
}

const kafelekWzrost = (page) => page
  .locator('.vilda-patient-stat')
  .filter({ has: page.locator('.vilda-patient-stat-label', { hasText: 'Wzrost' }) });

test.describe('P3 — centyl liczony w wieku pomiaru', () => {
  test('pomiar sprzed 9 miesięcy zachowuje swój centyl', async ({ page }) => {
    await otworzZKontem(page);

    const height = await wzrostNaMedianie(page, WIEK_POMIARU_M);
    expect(height, 'silnik centyli dostępny na tej stronie').not.toBeNull();

    const wPomiarze = await centylDla(page, height, WIEK_POMIARU_M);
    const naDzis = await centylDla(page, height, WIEK_DZIS_M);
    // Sanity: te dwie liczby MUSZĄ się różnić, inaczej test nic nie mierzy.
    expect(Math.round(wPomiarze), 'wzrost dobrany na medianę wieku pomiaru').toBe(50);
    expect(Math.abs(wPomiarze - naDzis), 'rozjazd wieku faktycznie zmienia centyl')
      .toBeGreaterThan(10);

    const patientId = await zalozPacjenta(page, {
      height, wiekLat: 12, wiekMies: 6, wiekDzisM: WIEK_DZIS_M,
    });
    await otworzKarte(page, patientId);

    const kafelek = kafelekWzrost(page);
    await expect(kafelek, 'centyl z wieku pomiaru, nie z dzisiejszego')
      .toContainText(`${Math.round(wPomiarze)}. centyl`);
    await expect(kafelek).not.toContainText(`${Math.round(naDzis)}. centyl`);
    await expect(kafelek, 'mediana nie może być alarmem')
      .not.toHaveClass(/vilda-patient-stat--alert/);
  });

  test('karta mówi wprost, z jakiego wieku są dane', async ({ page }) => {
    await otworzZKontem(page);
    const height = await wzrostNaMedianie(page, WIEK_POMIARU_M);
    const patientId = await zalozPacjenta(page, {
      height, wiekLat: 12, wiekMies: 6, wiekDzisM: WIEK_DZIS_M,
    });
    await otworzKarte(page, patientId);

    await expect(page.locator('.vilda-patient-age-note'))
      .toHaveText('Dane z wieku 12 lat 6 mies. (aktualnie pacjent ma 13 lat 3 mies.).');
    await expect(page.locator('.vilda-patient-tab-content[data-tab="antro"]'),
      'znika przypis o przeliczaniu — nic już nie przeliczamy')
      .not.toContainText('przeliczono na dziś');
  });

  test('pomiar z dziś nie dostaje adnotacji o wieku', async ({ page }) => {
    // Kontrola negatywna: linia pojawia się tylko wtedy, gdy jest o czym mówić.
    await otworzZKontem(page);
    const height = await wzrostNaMedianie(page, WIEK_POMIARU_M);
    const patientId = await zalozPacjenta(page, {
      height, wiekLat: 12, wiekMies: 6, wiekDzisM: WIEK_POMIARU_M,
    });
    await otworzKarte(page, patientId);

    await expect(page.locator('.vilda-patient-age-note')).toHaveCount(0);
  });

  test('prawdziwy skrajny pomiar nadal zapala alarm', async ({ page }) => {
    // Kontrola dodatnia: naprawa nie może polegać na wyciszeniu alarmów.
    await otworzZKontem(page);
    const mediana = await wzrostNaMedianie(page, WIEK_POMIARU_M);
    const niski = Math.round((mediana - 25) * 10) / 10;
    const centyl = await centylDla(page, niski, WIEK_POMIARU_M);
    expect(centyl, 'wzrost dobrany poniżej 3. centyla w wieku pomiaru').toBeLessThan(3);

    const patientId = await zalozPacjenta(page, {
      height: niski, wiekLat: 12, wiekMies: 6, wiekDzisM: WIEK_DZIS_M,
    });
    await otworzKarte(page, patientId);

    await expect(kafelekWzrost(page)).toHaveClass(/vilda-patient-stat--alert/);
  });
});
