import { expect, test } from '../support/test-czas.mjs';

// GROWTH-HV-UI6 — punkty terapii GH a tempo wzrastania po wczytaniu pacjenta (2026-09-10).
//
// Zgłoszenie właściciela: u pacjentki leczonej hormonem wzrostu Karta pacjenta pokazywała
// „Prędkość wzrastania 9,4 cm/rok" i „SDS tempa +1,5", a „Podsumowanie wyników" zaraz po
// „Wczytaj tego pacjenta" → „Odtwórz zapis" — „Tempo wzrastania: 8,2 cm/rok (obliczono jako
// średnią z ostatnich 3 lat)" i „SDS tempa: nie policzono". Po odświeżeniu strony liczby
// wracały do 9,4 i +1,5.
//
// Przyczyna nie leży w samym SDS, tylko w zestawie pomiarów, z którego liczone jest tempo:
//   * zapis pacjenta CELOWO nie przechowuje wierszy pochodzących z monitora terapii GH
//     (collectUserData odsiewa measurements z ghSync === true) — źródłem prawdy jest moduł
//     terapii, a nie kopia w rekordzie;
//   * odtworzenie zapisu przywraca więc tylko wiersze „ręczne”, a mostek importu punktów
//     terapii (importTherapyPointsToAdvancedGrowth) nie był na tej ścieżce wołany;
//   * dodatkowo czyszczenie formularza ustawia __vildaSuppressGhAdvancedImportUntil na
//     4 sekundy, więc nawet import wywołany z zewnątrz w tym oknie nic nie robił.
// Efekt: najbliższy punkt sprzed 11 miesięcy znikał, a tempo liczyło się z punktu sprzed
// trzech lat — poza oknem norm, stąd „nie policzono”.
test.use({ serviceWorkers: 'block' });

const HASLO = 'E2e#GhPkt!26aa';

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

// Dziewczynka, 14 lat, 148,5 cm.
//   * wiersz ręczny: 11 lat, 123,9 cm → odstęp 36 mies., tempo 8,2 cm/rok (poza oknem norm);
//   * punkt terapii GH: 13 lat 1 mies., 139,9 cm → odstęp 11 mies., tempo 9,4 cm/rok, SDS +2,5.
// Dokładnie te dwie liczby widział właściciel po obu stronach rozjazdu.
const PUNKT_GH = { id: 'gh-e2e-1', ageYears: 13, ageMonths: 1, height: 139.9, weight: 45, type: 'gh' };

async function policzPacjentke(page) {
  await page.fill('#lastName', 'Probna');
  await page.fill('#firstName', 'Alicja');
  await page.evaluate(() => {
    const set = (id, v) => {
      const e = document.getElementById(id);
      e.value = v;
      e.dispatchEvent(new Event('input', { bubbles: true }));
      e.dispatchEvent(new Event('change', { bubbles: true }));
    };
    set('age', '14'); set('ageMonths', '0'); set('sex', 'F');
    set('height', '148.5'); set('weight', '50.5');
    if (typeof window.update === 'function') window.update();
  });
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
    set('.adv-age-years', '11'); set('.adv-age-months', '0');
    set('.adv-height', '123.9'); set('.adv-weight', '35');
    window.calculateGrowthAdvanced();
  });
  // Punkt terapii wchodzi tak, jak wprowadza go moduł monitorowania leczenia GH.
  await page.evaluate((p) => {
    window.VildaPersistence.writeModuleJSON('GH_THERAPY_POINTS', [p], { force: true });
    window.ghTherapyPoints = [p];
  }, PUNKT_GH);
  await page.evaluate(() => window.importTherapyPointsToAdvancedGrowth());
  await page.waitForFunction(
    () => Number(window.advancedGrowthData && window.advancedGrowthData.growthVelocityGapM) === 11,
  );
}

const linie = (page) => page.evaluate(() => String(window.generateMetabolicSummary() || '')
  .split('\n').map((t) => t.trim()).filter(Boolean));

async function zapiszIOtworzKarte(page) {
  await page.locator('#saveDataBtnSidebar').click();
  await page.waitForFunction(async () => (await window.VildaVault.listPatients()).length === 1);
  const pid = await page.evaluate(async () => (await window.VildaVault.listPatients())[0].patientId);
  await page.evaluate(() => window.clearAllData());
  await page.evaluate((id) => window.VildaAuthUI.showPatientCard(id, (rekord) => {
    if (rekord) window.applyLoadedData(rekord);
  }, null), pid);
  const kafelek = page.locator('.vhv-tile');
  await expect(kafelek).toBeVisible();
  await expect(kafelek, 'kafelek Karty pacjenta niesie liczbę z punktu terapii').toContainText('+2,5');
  await page.getByRole('button', { name: 'Wczytaj tego pacjenta' }).click();
  await expect(page.locator('#vildaLoadChoiceModal')).toBeVisible();
}

test.describe('Punkty terapii GH wracają do historii po wczytaniu pacjenta', () => {
  test('„Odtwórz zapis”: tempo liczy się z punktu terapii, a nie sprzed trzech lat', async ({ page }) => {
    await otworz(page);
    await policzPacjentke(page);
    await zapiszIOtworzKarte(page);

    await page.locator('#vildaLcmRestore').click();
    await expect(page.locator('#vildaLoadChoiceModal')).toHaveCount(0);
    await expect(page.locator('#height'), 'odtworzenie przywraca ostatni pomiar').toHaveValue('148.5');

    await page.waitForFunction(
      () => Number(window.advancedGrowthData && window.advancedGrowthData.growthVelocityGapM) === 11,
      undefined,
      { timeout: 15_000 },
    );
    const wiersz = await page.evaluate(() => Array.from(
      document.querySelectorAll('#advMeasurements .measure-row[data-gh-sync="true"]'),
    ).map((r) => r.querySelector('.adv-height')?.value));
    expect(wiersz, 'wiersz punktu terapii wrócił do historii').toEqual(['139.9']);

    const l = await linie(page);
    const tempo = l.find((t) => /tempo wzrastania/i.test(t));
    expect(tempo, 'tempo z ostatnich 11 mies., nie średnia z trzech lat').toContain('9,4 cm/rok');
    expect(tempo).not.toMatch(/obliczono jako średnią/);
    const hv = l.find((t) => /^SDS tempa/.test(t));
    expect(hv, 'zdanie o SDS tempa jest, bez odświeżania strony').toBeTruthy();
    expect(hv).toContain('+2,5');
    expect(hv).not.toMatch(/nie policzono/);

    // Zgłoszenie właściciela po pierwszej wersji poprawki: w formularzu głównym zostawał
    // przycisk „Odtwórz zapisany stan", który po odtworzeniu nie ma już czego odtwarzać
    // (klik powtarzał tę samą operację, więc na ekranie nic się nie zmieniało). Powodem był
    // porządek wywołań: mostek punktów terapii startował PRZED tym, jak odtworzenie chowa
    // ten przycisk, więc zapamiętywał go jako widoczny i po imporcie przywracał. Odczekanie
    // jest tu celowe — import kończy się asynchronicznie i to właśnie jego koniec pokazywał
    // przycisk z powrotem.
    await page.waitForTimeout(1500);
    await expect(
      page.locator('#restoreStateBtn'),
      'po odtworzeniu nie ma po co proponować odtworzenia jeszcze raz',
    ).toBeHidden();
  });

  test('„Nowy pomiar”: punkt terapii zostaje w historii, nie trzeba rozwijać karty', async ({ page }) => {
    await otworz(page);
    await policzPacjentke(page);
    await zapiszIOtworzKarte(page);

    // Druga gałąź modalu. Tu tempo policzy się z ostatniej wizyty (moduł dokłada ją do
    // historii), więc mierzymy to, co na tej ścieżce naprawdę ginęło: sam wiersz punktu
    // terapii. Bez niego wykres, trajektoria i prognozy widzą pacjentkę bez roku leczenia.
    await page.locator('#vildaLcmNew').click();
    await expect(page.locator('#vildaLoadChoiceModal')).toHaveCount(0);
    await expect
      .poll(() => page.evaluate(() => Array.from(
        document.querySelectorAll('#advMeasurements .measure-row[data-gh-sync="true"]'),
      ).map((r) => r.querySelector('.adv-height')?.value)), { timeout: 15_000 })
      .toEqual(['139.9']);
  });
});
