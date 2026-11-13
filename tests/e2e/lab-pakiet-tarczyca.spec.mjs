import { expect, test } from '../support/test-czas.mjs';
import { otworzSejf } from '../support/lab-historia-dane.mjs';
import { czekajNaBadania, sekcjaBadan } from '../support/karta-czekanie.mjs';
import { PACJENTKA, kartaPakietu, otworzPakiet, tekst, wczytajPacjenta, wynikiBadan } from '../support/lab-pakiet-dane.mjs';

// LAB-PAKIETY PR1: pakiet „Tarczyca” na stronie „Jednostki lab.” na prawdziwym, fikcyjnym sejfie
// (tests/support/lab-pakiet-dane.mjs; zegar stron 17.06.2026). Decyzje właściciela 2026-11-12: tryb pracy
// przelicznika, tylko dla zalogowanego z wybranym pacjentem, ocena tym samym silnikiem co pojedyncze badanie,
// zapis zbiorczy do Badań w postaci zapisu „Przypnij do wizyty”. Dane wyłącznie fikcyjne.
test.use({ serviceWorkers: 'block' });

const bezCzasu = (lab) => JSON.parse(JSON.stringify(lab, (klucz, wartosc) => (klucz === 'capturedAtISO' ? '(chwila zapisu)' : wartosc)));

test('ocena na żywo jak w pojedynczym badaniu i zapis wypełnionych wyników do Badań', async ({ page }) => {
  const { patientId } = await otworzPakiet(page);
  const karta = kartaPakietu(page);
  await expect(karta).toBeVisible();
  // Jedna karta z zakładkami: w „Pakiecie badań” panele pojedynczego badania są schowane, karta i tytuł zostają.
  await expect(page.locator('#labFormPane')).toBeHidden();
  await expect(page.locator('#labResultPane')).toBeHidden();
  await expect(page.locator('#labModePackage')).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('#labModeSingle')).toHaveAttribute('aria-selected', 'false');
  await expect(page.locator('#labResultsCard h1')).toHaveText('Przelicznik jednostek laboratoryjnych');
  await expect(page.locator('#labResultsCard h1')).toBeVisible();
  await expect(page.locator('h1')).toHaveCount(1);
  await expect(page.locator('#labPkgName')).toHaveText('Tarczyca');
  await expect(karta.locator('.lab-pkg-row-label')).toHaveText(['TSH', 'fT4', 'fT3']);
  await expect(page.locator('#labPkgPatient')).toHaveText('Kobieta · 12.3 lat · wiek dziecięcy/młodzieńczy');
  // Jednostki domyślne to SI katalogu; data pobrania — dziś; bez wyników zapis jest nieczynny.
  expect(await page.evaluate(() => ['tsh', 'ft4', 'ft3'].map((id) => document.getElementById(`labPkgUnit-${id}`).value))).toEqual(['mIU/L', 'pmol/L', 'pmol/L']);
  await expect(page.locator('#labPkgDate')).toHaveValue('2026-06-17');
  await expect(page.locator('#labPkgSave')).toBeDisabled();
  await expect(karta.locator('.lab-pkg-card.is-empty')).toHaveCount(3);

  await page.locator('#labPkgValue-tsh').fill('6,8');
  await page.locator('#labPkgUnit-ft4').selectOption('ng/dL');
  await page.locator('#labPkgValue-ft4').fill('1,1');
  const tsh = karta.locator('.lab-pkg-card[data-analyte="tsh"]'), ft4 = karta.locator('.lab-pkg-card[data-analyte="ft4"]');
  expect(await tekst(tsh)).toBe('TSH 6,8 mIU/L powyżej normy Norma · Młodzież 11–19 lat: 0,5–4,3 mIU/L');
  await expect(tsh.locator('.lab-range-status')).toHaveClass(/is-above/);
  await expect(tsh.locator('svg.lab-pkg-bar')).toHaveAttribute('aria-label', /^TSH 6,8 mIU\/L powyżej normy; zakres 0,5–4,3/);
  expect(await tekst(ft4)).toBe('fT4 1,1 ng/dL w zakresie normy = 14,2 pmol/L Norma · Młodzież 11–19 lat: 1–1,6 ng/dL');
  await expect(ft4.locator('.lab-range-status')).toHaveClass(/is-normal/);
  await expect(karta.locator('.lab-pkg-card[data-analyte="ft3"]')).toHaveClass(/is-empty/);
  await expect(page.locator('#labPkgSources')).toHaveText('Źródła norm: Mayo Test 8939 — TSH · Mayo Test 8725 — fT4');
  // Ocena z formularza jest oceną silnika pojedynczego badania dla tej samej pacjentki.
  expect(await page.evaluate(() => {
    const patient = window.VildaLabConverterRuntime.getPackagePatient().patient;
    return [['tsh', '6,8', 'mIU/L'], ['ft4', '1,1', 'ng/dL']].map(([id, value, unit]) => window.LabUnitConverter.evaluate(id, { value, unit, patient }).status);
  })).toEqual(['above', 'within']);

  // Badanie z innego dnia: uwaga o doborze norm jak w oknie przypięcia.
  await page.locator('#labPkgDate').fill('2026-06-15');
  await expect(page.locator('#labPkgDateNote')).toContainText('Badanie było w innym dniu');
  await page.locator('#labPkgComment').fill('kontrola po 3 miesiącach');
  await expect(karta.locator('.lab-pkg-save-ctx')).toHaveText('Fikcyjna Badaniowa · wizyta: 12 l 3 m');
  await expect(karta.locator('.lab-pkg-save-sub')).toHaveText('2 wyniki trafią do Badań w karcie pacjenta');
  await expect(page.locator('#labPkgSave')).toHaveText('Zapisz 2 wyniki do karty');
  await page.locator('#labPkgSave').click();

  await expect(page.locator('#labPkgDone')).toBeVisible();
  expect(await tekst(page.locator('#labPkgDone'))).toBe('Zapisano 2 wyniki w karcie pacjenta TSH, fT4 · pobranie 15.06.2026 Otwórz Badania');
  await expect(page.locator('#labToast')).toHaveText('✓ Zapisano w karcie: TSH, fT4');
  // Formularz jest pusty po zapisie (ponowne kliknięcie niczego nie zdubluje), data wraca na dziś.
  expect(await page.evaluate(() => ['tsh', 'ft4', 'ft3'].map((id) => document.getElementById(`labPkgValue-${id}`).value))).toEqual(['', '', '']);
  await expect(page.locator('#labPkgComment')).toHaveValue('');
  await expect(page.locator('#labPkgDate')).toHaveValue('2026-06-17');
  await expect(page.locator('#labPkgSave')).toBeDisabled();

  const notatki = await wynikiBadan(page, patientId);
  expect(notatki.map((n) => [n.title, n.body, n.category, n.clinicalDateISO, n.linkedAgeMonths])).toEqual([
    ['fT4 (wolna tyroksyna): 1,1 ng/dL', '= 14,2 pmol/L\nkontrola po 3 miesiącach', 'wynik-badania', '2026-06-15', 147],
    ['TSH (tyreotropina): 6,8 mIU/L (SI)', '= 6,8 mIU/L\nkontrola po 3 miesiącach', 'wynik-badania', '2026-06-15', 147],
  ]);
  const [zapisFt4, zapisTsh] = notatki.map((n) => n.labResult);
  expect([zapisTsh.test, zapisTsh.value, zapisTsh.testKey, zapisTsh.valueNum, zapisTsh.unit]).toEqual(['TSH (tyreotropina)', '6,8 mIU/L (SI) = 6,8 mIU/L', 'tsh', 6.8, 'mIU/L']);
  expect([zapisFt4.test, zapisFt4.value, zapisFt4.testKey, zapisFt4.valueNum, zapisFt4.unit]).toEqual(['fT4 (wolna tyroksyna)', '1,1 ng/dL = 14,2 pmol/L', 'ft4', 1.1, 'ng/dL']);
  // Zapisana norma: zakres aplikacji dla wieku, w jednostce wpisu, z oceną pokazaną w formularzu.
  expect([zapisTsh.range.status, zapisTsh.range.classification, zapisTsh.range.range.context, zapisTsh.range.display]).toEqual(
    ['recorded', 'above', 'Młodzież 11–19 lat', { unit: 'mIU/L', low: 0.5, high: 4.3 }]);
  expect([zapisFt4.range.status, zapisFt4.range.classification, zapisFt4.range.display.unit]).toEqual(['recorded', 'within', 'ng/dL']);
  expect(zapisTsh.range.context).toMatchObject({ sex: 'F', ageYears: 12.25, lifeStage: 'pediatric', localOverride: false });

  // Jednostki z tego wpisu wracają przy następnym pakiecie na tym urządzeniu.
  await page.reload({ waitUntil: 'load' });
  await page.waitForFunction(() => window.VildaVault?.isUnlocked());
  await page.locator('#labModePackage').click();
  await expect(page.locator('#labPkgUnit-ft4')).toHaveValue('ng/dL');
  await expect(page.locator('#labPkgUnit-tsh')).toHaveValue('mIU/L');
  await expect(karta.locator('.lab-pkg-hint', { hasText: 'Jednostki zapamiętane z poprzedniego wpisu na tym urządzeniu.' })).toBeVisible();

  // Wyniki są w zakładce „Badania” karty pacjentki, z normą i strzałką z zapisu.
  await page.evaluate((pid) => window.VildaAuthUI.showPatientCard(pid, null, null, { activeTab: 'lab' }), patientId);
  await czekajNaBadania(page);
  const wiersze = sekcjaBadan(page).locator('.vilda-lab-hist-result-row');
  await expect(wiersze).toHaveCount(2);
  expect((await tekst(wiersze.nth(0)))).toContain('TSH 6,8 mIU/L ↑');
  expect((await tekst(wiersze.nth(1)))).toContain('fT4 1,1 ng/dL');
});

test('zapis z pakietu jest tym samym zapisem co „Przypnij do wizyty” pojedynczego badania', async ({ page }) => {
  const { patientId } = await otworzPakiet(page);
  // Pojedyncze badanie: TSH 6,8 μIU/mL przypięte do wizyty istniejącą ścieżką.
  await page.locator('#labModeSingle').click();
  await expect(page.locator('#labFormPane')).toBeVisible();
  await page.locator('#labSubstance').fill('TSH');
  await page.locator('#labSubstanceDropdown .lab-substance-option[data-id="tsh"]').click();
  await page.locator('#labUnit').selectOption('μIU/mL');
  await page.locator('#labValue').fill('6,8');
  await page.locator('#labPinResultBtn').click();
  await page.locator('#labPinDate').fill('2026-06-16');
  await page.locator('#labPinComment').fill('fikcyjny komentarz');
  await page.locator('#labPinSave').click();
  await expect(page.locator('#labPinOverlay')).toHaveCount(0);

  // Pakiet: to samo badanie, wartość, jednostka, data i komentarz.
  await page.locator('#labModePackage').click();
  await page.locator('#labPkgUnit-tsh').selectOption('μIU/mL');
  await page.locator('#labPkgValue-tsh').fill('6,8');
  await page.locator('#labPkgDate').fill('2026-06-16');
  await page.locator('#labPkgComment').fill('fikcyjny komentarz');
  await page.locator('#labPkgSave').click();
  await expect(page.locator('#labPkgDone')).toBeVisible();

  const notatki = await wynikiBadan(page, patientId);
  expect(notatki).toHaveLength(2);
  const pola = (n) => ({ title: n.title, body: n.body, category: n.category, clinicalDateISO: n.clinicalDateISO, linkedAgeMonths: n.linkedAgeMonths, labResult: bezCzasu(n.labResult) });
  expect(pola(notatki[1])).toEqual(pola(notatki[0]));
  expect(notatki[0].labResult.range.status).toBe('recorded');
  expect(notatki[0].title).toBe('TSH (tyreotropina): 6,8 μIU/mL');
});

test('bez logowania: zakładka pakietu z kłódką i bez pól, „Zaloguj się” otwiera logowanie, powrót zakładką do pojedynczego badania', async ({ page }) => {
  await page.route('**/*', (route) => (route.request().url().startsWith('http://127.0.0.1:') ? route.continue() : route.abort()));
  await page.addInitScript(() => {
    localStorage.setItem('vilda-terms-accepted-v1', JSON.stringify({ version: 1, acceptedAtISO: new Date().toISOString() }));
    localStorage.setItem('analyticsConsent', 'denied');
  });
  await page.goto('/przelicznik-jednostek.html', { waitUntil: 'load' });
  // Pojedyncze badanie działa jak dotąd, bez logowania.
  await expect(page.locator('#labModeBar')).toBeVisible();
  await expect(page.locator('#labModeBar')).toHaveAttribute('role', 'tablist');
  await expect(page.locator('#labModeBar [role="tab"]')).toHaveText(['Pojedyncze badanie', 'Pakiet badań']);
  await expect(page.locator('#labModeSingle')).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('#labFormPane')).toBeVisible();
  await expect(page.locator('#labPackageCard')).toBeHidden();
  await expect(page.locator('#labModePackage')).toHaveClass(/is-locked/);
  // Kłódka w zakładce mówi gościowi, że pakiet wymaga konta.
  await expect(page.locator('#labModePackage .lab-mode-lock')).toBeVisible();
  // Zakładki stoją w karcie przelicznika, pod jej tytułem.
  expect(await page.evaluate(() => {
    const karta = document.getElementById('labResultsCard'), tytul = karta.querySelector('h1'), pasek = document.getElementById('labModeBar');
    return karta.contains(pasek) && tytul.getBoundingClientRect().bottom <= pasek.getBoundingClientRect().top
      && pasek.getBoundingClientRect().bottom <= document.getElementById('labFormPane').getBoundingClientRect().top;
  })).toBe(true);

  await page.locator('#labModePackage').click();
  const karta = kartaPakietu(page);
  expect(await tekst(karta)).toBe('Pakiety badań są dostępne po zalogowaniu Pakiet zapisuje wyniki w karcie pacjenta, dlatego wymaga konta. Pojedyncze badanie przeliczysz i ocenisz jak dotąd, bez logowania. Zaloguj się');
  await expect(page.locator('#labModePackage')).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('#labFormPane')).toBeHidden();
  await expect(page.locator('#labSuggestCard')).toBeHidden();
  // Bez logowania formularz w ogóle nie powstaje: żadnych pól ani przycisku zapisu.
  await expect(karta.locator('input, select')).toHaveCount(0);
  await expect(page.locator('#labPkgSave')).toHaveCount(0);

  // Powrót do pojedynczego badania: zakładka (bramka nie ma już osobnego przycisku).
  await expect(karta.locator('button')).toHaveCount(1);
  await page.locator('#labModeSingle').click();
  await expect(page.locator('#labFormPane')).toBeVisible();
  await expect(page.locator('#labPackageCard')).toBeHidden();
  await expect(page.locator('#labModeSingle')).toHaveAttribute('aria-selected', 'true');
  // Klawiatura zakładek: strzałka przełącza i zostawia fokus na wybranej zakładce; w tabulacji jest tylko wybrana.
  await page.locator('#labModeSingle').focus();
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('#labModePackage')).toBeFocused();
  await expect(page.locator('#labModePackage')).toHaveAttribute('aria-selected', 'true');
  expect(await page.evaluate(() => ['labModeSingle', 'labModePackage'].map((id) => document.getElementById(id).getAttribute('tabindex')))).toEqual(['-1', '0']);
  await page.keyboard.press('Home');
  await expect(page.locator('#labModeSingle')).toBeFocused();
  await expect(page.locator('#labFormPane')).toBeVisible();
  await page.keyboard.press('End');
  await expect(karta.locator('.lab-pkg-gate-title')).toBeVisible();
  await page.keyboard.press('ArrowLeft');
  await expect(page.locator('#labPackageCard')).toBeHidden();

  await page.locator('#labModePackage').click();
  await page.locator('#labPkgGateAction').click();
  await page.waitForFunction(() => Boolean(window.VildaAuthUI) && document.documentElement.classList.contains('vilda-auth-locked'));
});

test('zalogowany bez pacjenta: bramka i lista pacjentów; wyniki nie przechodzą na innego pacjenta ani poza sesję', async ({ page }) => {
  const { patientId } = await otworzPakiet(page, { pacjent: false });
  const karta = kartaPakietu(page);
  await expect(page.locator('#labModePackage')).not.toHaveClass(/is-locked/);
  await expect(karta.locator('.lab-pkg-gate-title')).toHaveText('Nie wybrano pacjenta');
  await expect(karta.locator('input, select')).toHaveCount(0);
  // „Wybierz pacjenta” to ta sama droga co „Baza pacjentów” w menu.
  await page.locator('#labPkgGateAction').click();
  await expect(page.locator('.vilda-auth-title', { hasText: 'Baza pacjentów' })).toBeVisible();
  await page.evaluate(() => window.VildaAuthUI.hide());

  await wczytajPacjenta(page, patientId);
  await expect(page.locator('#labPkgValue-tsh')).toBeVisible();
  await page.locator('#labPkgValue-tsh').fill('2,5');
  await page.locator('#labPkgComment').fill('fikcyjny komentarz');
  await expect(page.locator('#labPkgSave')).toBeEnabled();

  // Inny pacjent wczytany do formularza: pola puste, wiersz zapisu wskazuje nową osobę.
  const drugi = await page.evaluate(async () => (await window.VildaVault.savePatient({
    name: 'Fikcyjny Drugi', user: { name: 'Fikcyjny Drugi', sex: 'M', age: 40, ageMonths: 0, height: 180, weight: 80 },
  }, { dedup: false })).patientId);
  await wczytajPacjenta(page, drugi, { name: 'Fikcyjny Drugi', sex: 'M', age: 40, ageMonths: 0 });
  await expect(page.locator('#labPkgValue-tsh')).toHaveValue('');
  await expect(page.locator('#labPkgComment')).toHaveValue('');
  await expect(karta.locator('.lab-pkg-save-ctx')).toHaveText('Fikcyjny Drugi · wizyta: 40 l');
  await expect(page.locator('#labPkgPatient')).toHaveText('Mężczyzna · 40 lat');
  // Dorosły dostaje zakres dorosłych.
  await page.locator('#labPkgValue-tsh').fill('2,5');
  expect(await tekst(karta.locator('.lab-pkg-card[data-analyte="tsh"]'))).toBe('TSH 2,5 mIU/L w zakresie normy Norma · Dorośli (≥ 20 lat): 0,3–4,2 mIU/L');

  // Wyczyszczenie sesji użytkownika opróżnia pola pakietu.
  await page.evaluate(() => window.dispatchEvent(new CustomEvent('vilda:user-state-cleared')));
  await expect(page.locator('#labPkgValue-tsh')).toHaveValue('');
  expect(await wynikiBadan(page, patientId)).toEqual([]);
  expect(await wynikiBadan(page, drugi)).toEqual([]);
});

test('błędny wynik i przyszła data wstrzymują zapis; „Wyczyść pakiet” opróżnia pola', async ({ page }) => {
  const { patientId } = await otworzPakiet(page);
  await page.locator('#labPkgValue-tsh').fill('2,5');
  await page.locator('#labPkgValue-ft4').fill('abc');
  await expect(page.locator('#labPkgError-ft4')).toHaveText('Wartość nie jest liczbą.');
  await expect(page.locator('#labPkgValue-ft4')).toHaveAttribute('aria-invalid', 'true');
  await expect(page.locator('#labPkgSave')).toBeDisabled();
  // Wiersz zapisu nie obiecuje zapisu, dopóki pole jest błędne.
  await expect(kartaPakietu(page).locator('.lab-pkg-save-sub')).toHaveText('popraw wynik: fT4 — do tego czasu zapis jest wstrzymany');
  await page.locator('#labPkgValue-ft4').fill('');
  await expect(page.locator('#labPkgError-ft4')).toBeHidden();
  await expect(kartaPakietu(page).locator('.lab-pkg-save-sub')).toHaveText('1 wynik trafi do Badań w karcie pacjenta');
  await expect(page.locator('#labPkgSave')).toHaveText('Zapisz 1 wynik do karty');

  await page.locator('#labPkgDate').fill('2026-06-18');
  await expect(page.locator('#labPkgDateNote')).toHaveText('Data pobrania nie może być późniejsza niż dziś.');
  await page.locator('#labPkgSave').click();
  await expect(page.locator('#labPkgError')).toHaveText('Data pobrania nie może być późniejsza niż dziś.');
  expect(await wynikiBadan(page, patientId)).toEqual([]);

  await page.locator('#labPkgClear').click();
  await expect(page.locator('#labPkgValue-tsh')).toHaveValue('');
  await expect(page.locator('#labPkgDate')).toHaveValue('2026-06-17');
  await expect(page.locator('#labPkgError')).toBeHidden();
  // Pojedyncze badanie zachowuje swój stan niezależnie od pakietu.
  await page.locator('#labModeSingle').click();
  await expect(page.locator('#labFormPane')).toBeVisible();
  await expect(page.locator('#labSuggestCard')).toBeVisible();
});

// Makieta zakładek (zaakceptowana 2026-11-13): jedna karta, zakładki pod tytułem. Zakładki trzymają szerokość
// lewej kolumny w obu trybach, więc przełączenie niczego nie przesuwa; prawa kolumna pakietu zaczyna się tam,
// gdzie treść panelu wyniku pojedynczego badania.
for (const [opis, szerokosc] of [['warsztat 1440 px', 1440], ['warsztat 1920 px', 1920], ['jedna kolumna 1100 px', 1100]]) {
  test(`zakładki mają szerokość kolumny formularza w obu trybach — ${opis}`, async ({ page }) => {
    await page.setViewportSize({ width: szerokosc, height: 900 });
    await otworzPakiet(page);
    await expect(page.locator('#labPkgValue-tsh')).toBeVisible();
    const miary = () => page.evaluate(() => {
      const r = (el) => { const b = el.getBoundingClientRect(); return { l: Math.round(b.left), p: Math.round(b.right), g: Math.round(b.top), d: Math.round(b.bottom) }; };
      const widoczny = (el) => (el && el.offsetParent !== null ? r(el) : null);
      const q = (selektor) => document.querySelector(selektor);
      return { karta: r(q('#labResultsCard')), tytul: r(q('#labResultsCard h1')), pasek: r(q('#labModeBar')),
        krok: widoczny(q('#labStep1')), wynik: widoczny(q('#labResultSection')), pakiet: widoczny(q('.lab-pkg-form')), ocena: widoczny(q('.lab-pkg-results')),
        kolumny: getComputedStyle(q('#labResultsCard')).gridTemplateColumns.split(' ').length };
    });
    const pakiet = await miary();
    await page.locator('#labModeSingle').click();
    await expect(page.locator('#labFormPane')).toBeVisible();
    const pojedyncze = await miary();
    // Karta, tytuł i zakładki stoją w tym samym miejscu w obu trybach.
    expect([pakiet.karta.l, pakiet.karta.p, pakiet.tytul, pakiet.pasek]).toEqual([pojedyncze.karta.l, pojedyncze.karta.p, pojedyncze.tytul, pojedyncze.pasek]);
    // Zakładki pod tytułem, nad treścią; lewa i prawa krawędź równo z formularzem pojedynczego badania i pakietu.
    expect(pakiet.pasek.g).toBeGreaterThanOrEqual(pakiet.tytul.d);
    expect(pakiet.pakiet.g).toBeGreaterThanOrEqual(pakiet.pasek.d);
    expect(pojedyncze.krok.g).toBeGreaterThanOrEqual(pojedyncze.pasek.d);
    expect([pakiet.pakiet.l, pakiet.pakiet.p]).toEqual([pakiet.pasek.l, pakiet.pasek.p]);
    expect([pojedyncze.krok.l, pojedyncze.krok.p]).toEqual([pojedyncze.pasek.l, pojedyncze.pasek.p]);
    if (szerokosc >= 1440) {
      // Warsztat: dwie kolumny w obu trybach; ocena pakietu zaczyna się na prawo od zakładek, w kolumnie wyniku.
      expect([pakiet.kolumny, pojedyncze.kolumny]).toEqual([2, 2]);
      expect(pakiet.ocena.l).toBeGreaterThan(pakiet.pasek.p);
      expect(pakiet.ocena.g).toBe(pakiet.pakiet.g);
      expect(pakiet.ocena.p).toBeLessThanOrEqual(pakiet.karta.p);
    } else {
      // Jedna kolumna: ocena pod formularzem, na jego szerokość.
      expect([pakiet.ocena.l, pakiet.ocena.p]).toEqual([pakiet.pakiet.l, pakiet.pakiet.p]);
      expect(pakiet.ocena.g).toBeGreaterThanOrEqual(pakiet.pakiet.d);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });
}

test('skrót „Wpisz pakiet: Tarczyca” z zakładki Badania otwiera pakiet dla wczytanego pacjenta', async ({ page }) => {
  const patientId = await otworzSejf(page);
  // Karta pacjenta, który nie jest wczytany do formularza: bez skrótu.
  await page.evaluate((pid) => window.VildaAuthUI.showPatientCard(pid, null, null, { activeTab: 'lab' }), patientId);
  await czekajNaBadania(page);
  await expect(sekcjaBadan(page).locator('a.vilda-lab-hist-check')).toBeVisible();
  await expect(sekcjaBadan(page).locator('a.vilda-lab-hist-package')).toHaveCount(0);
  await page.evaluate(() => window.VildaAuthUI.hide());

  await wczytajPacjenta(page, patientId);
  await page.evaluate((pid) => window.VildaAuthUI.showPatientCard(pid, null, null, { activeTab: 'lab' }), patientId);
  await czekajNaBadania(page);
  const skrot = sekcjaBadan(page).locator('a.vilda-lab-hist-package');
  await expect(skrot).toHaveText('Wpisz pakiet: Tarczyca →');
  await skrot.click();
  await expect(page).toHaveURL(/\/przelicznik-jednostek\.html\?pakiet=tarczyca$/);
  await expect(page.locator('#labModePackage')).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('#labPkgValue-tsh')).toBeVisible();
  await expect(kartaPakietu(page).locator('.lab-pkg-save-ctx')).toHaveText(`${PACJENTKA.name} · wizyta: 12 l 3 m`);
  // Odnośnik z badaniem (?badanie=) wraca do pojedynczego badania.
  await page.goto('/przelicznik-jednostek.html?badanie=tsh', { waitUntil: 'load' });
  await expect(page.locator('#labModeSingle')).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('#labFormPane')).toBeVisible();
  await expect(page.locator('#labSubstance')).toHaveValue('TSH (tyreotropina)');
});
