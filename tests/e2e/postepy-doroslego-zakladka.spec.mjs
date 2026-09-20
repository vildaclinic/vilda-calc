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
    await expect(panel.locator('svg.vilda-pd-svg'), 'z wykresem').toBeVisible();
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
    await expect(page.locator('.vilda-pd-host svg.vilda-pd-svg')).toBeVisible();

    const przewija = await page.evaluate(() =>
      document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
    expect(przewija, 'brak poziomego przewijania (AGENTS.md §6)').toBe(false);
  });
});
