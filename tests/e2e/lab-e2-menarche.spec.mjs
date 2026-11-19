import { expect, test } from '../support/test-czas.mjs';
import { otworzBadania, pasekHistorii, sekcjaBadan } from '../support/lab-historia-dane.mjs';
import { kartaPakietu, tekst, utworzPakiet } from '../support/lab-pakiet-dane.mjs';
import {
  BRAK_DLA_KONTEKSTU, CIAZA, FAZY, NAGLOWEK_DOROSLA, NAGLOWEK_NIELETNIA, R1, R1_ZMIEN, R2_BRAK, WARIANTY_DOROSLA, WARIANTY_NIELETNIA,
  WPIS_ODRZUCONY, WSKAZOWKA_DOROSLA, bezPoziomegoPrzewijania, daneGoscia, otworzGoscia, otworzPanel, otworzPrzelicznik, r2Ponizej, stan,
  wczytajOsobe, wybierzBadanie, wybierzEstradiol, wykresHormonow, zapisaneDane,
} from '../support/lab-e2-menarche.mjs';

// P-E2-MENARCHE (decyzje właściciela 2026-11-19): estradiol u dziewczynki poniżej 18 lat — zakresy dorosłej kobiety
// dopiero po 5 latach od menarche; wcześniej (albo bez wpisanego wieku menarche) zakres jak dotąd, a zwykłe fazy cyklu
// są niedostępne. „Postmenopauza” nie jest proponowana poniżej 18 lat w żadnym badaniu. Tytuł każdego testu:
// wejście → oczekiwany wynik. Prawdziwy, fikcyjny sejf; wiek menarche w kształcie payload.puberty.menarcheAgeYears
// (tests/support/lab-e2-menarche.mjs); zegar stron 17.06.2026. Dane wyłącznie FIKCYJNE.
test.use({ serviceWorkers: 'block' });

const A = { imie: 'Anna', lata: 15, th: 5, menarche: 10 };
const C = { imie: 'Celina', lata: 13, th: 4, menarche: 12 };
const D = { imie: 'Dorota', lata: 16, th: 5, menarche: null };
const DOROSLA = { imie: 'Ewa', lata: 30, th: null, menarche: 12 };
const NIEZNANA_NIELETNIA = ['(nieznana)', ...FAZY, ...CIAZA];
const NIEZNANA_NIELETNIA_BEZ_FAZ = ['(nieznana)', ...FAZY.map((faza) => faza + ' [wyłączona]'), ...CIAZA];
const WSZYSTKIE = (pierwsza) => [pierwsza, ...FAZY, 'Postmenopauza', ...CIAZA];

async function start(page, osoba, wartosc, opcje) {
  await otworzPrzelicznik(page);
  const patientId = await wczytajOsobe(page, osoba, opcje);
  await wybierzEstradiol(page, wartosc);
  await otworzPanel(page);
  return patientId;
}

test('A: 15 lat, Th V, menarche 10,0 w danych, faza nieznana, E2 450 pmol/L → wiersz „Od menarche: 5,0 lat (≥ 5)…”, trzy warianty bez oceny, lista bez Postmenopauzy', async ({ page }) => {
  await start(page, A, 450);
  expect(await stan(page)).toMatchObject({
    opis: 'Kobieta · 15 lat · wiek dziecięcy/młodzieńczy · Th V', wiersz: R1_ZMIEN,
    selektor: true, opcje: NIEZNANA_NIELETNIA, faza: '',
    pole: true, etykieta: 'Wiek menarche [lata]', placeholder: '(z danych: 10,0)', wpis: '', bledny: false, nota: null, reset: false,
    status: '', naglowek: NAGLOWEK_NIELETNIA, warianty: WARIANTY_NIELETNIA, zakres: '', wynik: '450',
  });
  // „(≥ 5)” nie łamie się między wierszami: w nawiasie jest twarda spacja.
  await expect(page.locator('#labClinicalHint')).toContainText('(≥ 5)');
  // Pole stoi zaraz za „Etapem Tannera”, a wynik nie ma paska normy ani koloru.
  expect(await page.locator('#labPatientOverride > label:visible').evaluateAll((pola) => pola.map((p) => p.id || p.firstChild.textContent.trim())))
    .toEqual(['Płeć', 'Wiek [lata]', 'Wiek [mies.]', 'labOverrideCycleWrap', 'labOverrideTannerWrap', 'labOverrideMenarcheWrap']);
  await expect(page.locator('#labRangeBlock .lab-range-scale')).toHaveCount(0);
  await expect(page.locator('#labRangeBlock [data-variant-id]')).toHaveCount(3);
  await expect(page.locator('#labRangeBlock [data-variant-id="e2_female_postmeno"]')).toHaveCount(0);
});

test('B: 15 lat, Th V, menarche 10,0, faza lutealna, E2 450 pmol/L → zakres dorosłej 200–770 pmol/L, „w zakresie normy”, wiersz o menarche bez wskazówki', async ({ page }) => {
  await start(page, A, 450);
  await page.locator('#labOverrideCycle').selectOption('luteal');
  expect(await stan(page)).toMatchObject({
    opis: 'Kobieta · 15 lat · wiek dziecięcy/młodzieńczy · Th V · faza lutealna · nadpisanie lokalne', wiersz: R1,
    faza: 'luteal', nota: null, reset: true, status: '✓ w zakresie normy', zakres: 'zakres: 200–770 pmol/L', warianty: [],
  });
  // Pozostałe fazy: te same wiersze co u dorosłej; powrót do „nieznana” przywraca trzy warianty.
  for (const [faza, zakres] of [['follicular', 'zakres: 70–290 pmol/L'], ['ovulation', 'zakres: 380–1460 pmol/L']]) {
    await page.locator('#labOverrideCycle').selectOption(faza);
    await expect(page.locator('#labResultSourceLine')).toContainText(zakres.replace('zakres: ', ''));
  }
  await page.locator('#labOverrideCycle').selectOption('');
  expect(await stan(page)).toMatchObject({ wiersz: R1_ZMIEN, warianty: WARIANTY_NIELETNIA, status: '' });
});

test('C: 13 lat, Th IV, menarche 12,0 (rok temu), E2 150 pmol/L → zakres jak dotąd 55,1–312 pmol/L, fazy cyklu wyszarzone, nota „…mniej niż 5 lat (1,0).”', async ({ page }) => {
  await start(page, C, 150);
  expect(await stan(page)).toMatchObject({
    opis: 'Kobieta · 13 lat · wiek dziecięcy/młodzieńczy · Th IV', wiersz: null, opcje: NIEZNANA_NIELETNIA_BEZ_FAZ, faza: '',
    pole: true, placeholder: '(z danych: 12,0)', wpis: '', nota: r2Ponizej('1,0'), reset: false,
    status: '✓ w zakresie normy', zakres: 'zakres: 55,1–312 pmol/L', warianty: [],
  });
  // Nota stoi na końcu panelu: za polami, przed „Resetuj do danych pacjenta”.
  expect(await page.locator('#labPatientOverride').evaluate((panel) => [...panel.children].map((el) => el.id).filter(Boolean).slice(-3)))
    .toEqual(['labOverrideTannerNote', 'labOverrideMenarcheNote', 'labOverrideReset']);
  await expect(page.locator('#labOverrideMenarcheNote')).toHaveClass(/lab-override-note/);
});

test('D: 16 lat, Th V, bez wieku menarche w danych, E2 250 pmol/L → zakres jak dotąd 0–290 pmol/L, pole z „np. 12,5”, nota o wpisaniu wieku menarche', async ({ page }) => {
  await start(page, D, 250);
  expect(await stan(page)).toMatchObject({
    opis: 'Kobieta · 16 lat · wiek dziecięcy/młodzieńczy · Th V', wiersz: null, opcje: NIEZNANA_NIELETNIA_BEZ_FAZ,
    pole: true, placeholder: 'np. 12,5', wpis: '', nota: R2_BRAK, reset: false,
    status: '✓ w zakresie normy', zakres: 'zakres: 0–290 pmol/L',
  });
});

test('E: 16 lat, Th V, bez menarche, wybrana „Ciąża — I trymestr”, E2 3000 pmol/L → brak zakresu i komunikat jak u dorosłej; w opisie „ciąża — I trymestr”', async ({ page }) => {
  await start(page, D, 3000);
  for (const [wybor, nazwa] of [['pregnancy_t1', 'ciąża — I trymestr'], ['pregnancy_t2', 'ciąża — II trymestr'], ['pregnancy_t3', 'ciąża — III trymestr']]) {
    await page.locator('#labOverrideCycle').selectOption(wybor);
    expect(await stan(page), wybor).toMatchObject({
      opis: `Kobieta · 16 lat · wiek dziecięcy/młodzieńczy · Th V · ${nazwa} · nadpisanie lokalne`, wiersz: null, faza: wybor,
      nota: R2_BRAK, reset: true, status: '', brakZakresu: BRAK_DLA_KONTEKSTU, zakres: '', warianty: [], wynik: '3000',
    });
  }
  await expect(page.locator('#labRangeBlock .lab-range-scale')).toHaveCount(0);
});

test('G: pacjentka D + wpis „11,0” w polu „Wiek menarche [lata]” → trzy warianty jak u dorosłej, opis „… · menarche 11,0 · nadpisanie lokalne”; wpis nie trafia do żadnych zapisanych danych', async ({ page }) => {
  const patientId = await start(page, D, 250);
  const przed = await zapisaneDane(page, patientId);
  const pole = page.locator('#labOverrideMenarcheAge');
  await pole.fill('11,0');
  expect(await stan(page)).toMatchObject({
    opis: 'Kobieta · 16 lat · wiek dziecięcy/młodzieńczy · Th V · menarche 11,0 · nadpisanie lokalne', wiersz: R1_ZMIEN,
    opcje: NIEZNANA_NIELETNIA, wpis: '11,0', bledny: false, nota: null, reset: true,
    status: '', naglowek: NAGLOWEK_NIELETNIA, warianty: WARIANTY_NIELETNIA,
  });
  // Kropka zamiast przecinka daje to samo; wartość z danych nie jest potrzebna.
  await pole.fill('11.0');
  await expect(page.locator('#labPatientText')).toContainText('menarche 11,0 · nadpisanie lokalne');
  await page.locator('#labOverrideCycle').selectOption('luteal');
  expect(await stan(page)).toMatchObject({
    opis: 'Kobieta · 16 lat · wiek dziecięcy/młodzieńczy · Th V · menarche 11,0 · faza lutealna · nadpisanie lokalne', wiersz: R1,
    status: '✓ w zakresie normy', zakres: 'zakres: 200–770 pmol/L',
  });
  // Wpis 12,5 (3,5 roku od menarche): poniżej progu — zakres jak dotąd, nota z liczbą lat, wybrana faza wraca do „nieznana”.
  await pole.fill('12,5');
  await pole.blur();
  expect(await stan(page)).toMatchObject({
    opis: 'Kobieta · 16 lat · wiek dziecięcy/młodzieńczy · Th V · menarche 12,5 · nadpisanie lokalne', wiersz: null,
    opcje: NIEZNANA_NIELETNIA_BEZ_FAZ, faza: '', nota: r2Ponizej('3,5'), zakres: 'zakres: 0–290 pmol/L',
  });
  // Wpis lokalny żyje tylko w tym sprawdzeniu: rekord sejfu, dane wspólne, sesja formularza i magazyny bez zmian.
  await pole.fill('11,0');
  await pole.blur();
  await expect(page.locator('#labClinicalHint')).toContainText('Od menarche: 5,0 lat');
  expect(await zapisaneDane(page, patientId)).toBe(przed);
  const zapisane = JSON.parse(przed);
  expect(zapisane.wersje).toHaveLength(1);
  expect([zapisane.wersje[0].puberty, zapisane.sesja.puberty, zapisane.wspolne.puberty]).toEqual([undefined, undefined, undefined]);
  expect(przed).not.toMatch(/menarcheAge|menarche_age/);
});

test('granica: menarche 10,0 — 14 lat 11 mies. → zakres jak dotąd i nota „(4,9)”; 15 lat 0 mies. → obsługa jak u dorosłej', async ({ page }) => {
  await otworzPrzelicznik(page);
  await wczytajOsobe(page, { imie: 'Bogna', lata: 14, miesiace: 11, th: 5, menarche: 10 });
  await wybierzEstradiol(page, 250);
  await otworzPanel(page);
  expect(await stan(page)).toMatchObject({
    opis: 'Kobieta · 14.9 lat · wiek dziecięcy/młodzieńczy · Th V', wiersz: null, opcje: NIEZNANA_NIELETNIA_BEZ_FAZ,
    placeholder: '(z danych: 10,0)', nota: r2Ponizej('4,9'), status: '✓ w zakresie normy', zakres: 'zakres: 0–290 pmol/L',
  });
  await wczytajOsobe(page, { imie: 'Bogna', lata: 15, miesiace: 0, th: 5, menarche: 10 });
  await wybierzEstradiol(page, 250);
  expect(await stan(page)).toMatchObject({
    opis: 'Kobieta · 15 lat · wiek dziecięcy/młodzieńczy · Th V', wiersz: R1_ZMIEN, opcje: NIEZNANA_NIELETNIA,
    nota: null, status: '', warianty: WARIANTY_NIELETNIA,
  });
  // 17 lat 11 mies. po progu i 18 lat: wybrana faza daje ten sam zakres — bez skoku w dniu 18. urodzin.
  for (const [osoba, opis] of [[{ imie: 'Hanna', lata: 17, miesiace: 11, th: 5, menarche: 12 }, 'Kobieta · 17.9 lat'], [{ imie: 'Hanna', lata: 18, miesiace: 0, th: 5, menarche: 12 }, 'Kobieta · 18 lat']]) {
    await wczytajOsobe(page, osoba);
    await wybierzEstradiol(page, 250);
    await page.locator('#labOverrideCycle').selectOption('luteal');
    await expect(page.locator('#labPatientText')).toContainText(opis);
    expect(await stan(page), opis).toMatchObject({ status: '✓ w zakresie normy', zakres: 'zakres: 200–770 pmol/L' });
  }
});

test('dane pokwitaniowe tylko w rekordzie sejfu (bez sesji formularza): 16 lat, menarche 10,5 → wiersz „Od menarche: 5,5 lat (≥ 5)…” i trzy warianty', async ({ page }) => {
  const patientId = await start(page, { imie: 'Filipa', lata: 16, th: null, menarche: 10.5 }, 250, { sesja: false });
  expect(JSON.parse(await zapisaneDane(page, patientId)).wersje[0].puberty).toEqual({ menarcheAgeYears: 10.5 });
  expect(await stan(page)).toMatchObject({
    opis: 'Kobieta · 16 lat · wiek dziecięcy/młodzieńczy',
    wiersz: 'Od menarche: 5,5 lat (≥ 5) — zakresy estradiolu jak u dorosłej. Jeśli faza cyklu jest znana, wybierz ją w „Zmień ▼".',
    placeholder: '(z danych: 10,5)', nota: null, warianty: WARIANTY_NIELETNIA, opcje: NIEZNANA_NIELETNIA,
  });
});

test('prolaktyna (inne badanie z tym selektorem): 16 lat → lista bez „Postmenopauzy”, fazy do wyboru, pusta opcja „(domyślnie)”; 30 lat → osiem opcji w dotychczasowej kolejności', async ({ page }) => {
  await otworzPrzelicznik(page);
  await wczytajOsobe(page, D);
  await wybierzBadanie(page, 'prolactin', 'Prolaktyna', 300);
  await otworzPanel(page);
  expect(await stan(page)).toMatchObject({ opis: 'Kobieta · 16 lat · wiek dziecięcy/młodzieńczy · Th V', selektor: true,
    opcje: ['(domyślnie)', ...FAZY, ...CIAZA], pole: false, nota: null, wiersz: null });
  await page.locator('#labOverrideCycle').selectOption('luteal');
  await expect(page.locator('#labPatientText')).toHaveText('Kobieta · 16 lat · wiek dziecięcy/młodzieńczy · Th V · faza lutealna · nadpisanie lokalne');
  await wczytajOsobe(page, DOROSLA);
  await wybierzBadanie(page, 'prolactin', 'Prolaktyna', 300);
  expect(await stan(page)).toMatchObject({ opis: 'Kobieta · 30 lat', opcje: WSZYSTKIE('(domyślnie)'), faza: '', pole: false });
  expect(await page.locator('#labOverrideCycle option').evaluateAll((opcje) => opcje.map((o) => o.value)))
    .toEqual(['', 'follicular', 'ovulation', 'luteal', 'postmenopause', 'pregnancy_t1', 'pregnancy_t2', 'pregnancy_t3']);
  await page.locator('#labOverrideCycle').selectOption('postmenopause');
  await expect(page.locator('#labPatientText')).toHaveText('Kobieta · 30 lat · postmenopauza · nadpisanie lokalne');
});

test('dorosła 30 lat (menarche 12,0 w danych) → bez zmian: cztery warianty, wskazówka o fazie lub menopauzie, postmenopauza 0–110, ciąża bez zakresu, bez pola „Wiek menarche”', async ({ page }) => {
  await start(page, DOROSLA, 450);
  expect(await stan(page)).toMatchObject({
    opis: 'Kobieta · 30 lat', wiersz: WSKAZOWKA_DOROSLA, opcje: WSZYSTKIE('(nieznana)'), faza: '', pole: false, nota: null,
    status: '', naglowek: NAGLOWEK_DOROSLA, warianty: WARIANTY_DOROSLA,
  });
  await page.locator('#labOverrideCycle').selectOption('luteal');
  expect(await stan(page)).toMatchObject({ opis: 'Kobieta · 30 lat · faza lutealna · nadpisanie lokalne', wiersz: null, status: '✓ w zakresie normy', zakres: 'zakres: 200–770 pmol/L' });
  await page.locator('#labOverrideCycle').selectOption('postmenopause');
  expect(await stan(page)).toMatchObject({ opis: 'Kobieta · 30 lat · postmenopauza · nadpisanie lokalne', zakres: 'zakres: 0–110 pmol/L' });
  await page.locator('#labOverrideCycle').selectOption('pregnancy_t2');
  expect(await stan(page)).toMatchObject({ opis: 'Kobieta · 30 lat · ciąża — II trymestr · nadpisanie lokalne', brakZakresu: BRAK_DLA_KONTEKSTU, zakres: '', status: '' });
});

test('czyszczenie: „Resetuj do danych pacjenta”, zmiana pacjentki, płeć „Mężczyzna” i „Wyczyść wszystkie pola” → lokalny wiek menarche znika', async ({ page }) => {
  await start(page, D, 250);
  const pole = page.locator('#labOverrideMenarcheAge');
  const wpisz = async () => {
    await pole.fill('11');
    await expect(page.locator('#labPatientText')).toContainText('menarche 11,0 · nadpisanie lokalne');
  };
  const bezWpisu = async (osoba = 'Kobieta · 16 lat · wiek dziecięcy/młodzieńczy · Th V') => {
    await expect(pole).toHaveValue('');
    expect(await stan(page)).toMatchObject({ opis: osoba, wiersz: null, nota: R2_BRAK, zakres: 'zakres: 0–290 pmol/L', reset: false });
  };
  // 1. „Resetuj do danych pacjenta”.
  await wpisz();
  await page.locator('#labOverrideReset').click();
  await bezWpisu();
  // 2. Płeć „Mężczyzna”: pole i selektor fazy znikają, wpis jest czyszczony; powrót do „(z danych)” go nie wskrzesza.
  await wpisz();
  await page.locator('#labOverrideSex').selectOption('M');
  await expect(page.locator('#labOverrideMenarcheWrap')).toBeHidden();
  await expect(page.locator('#labOverrideCycleWrap')).toBeHidden();
  await expect(pole).toHaveValue('');
  await page.locator('#labOverrideSex').selectOption('');
  await bezWpisu();
  // 3. Zmiana pacjentki: wpis nie przechodzi na inną osobę.
  await wpisz();
  await wczytajOsobe(page, C);
  await wybierzEstradiol(page, 150);
  await expect(pole).toHaveValue('');
  expect(await stan(page)).toMatchObject({ opis: 'Kobieta · 13 lat · wiek dziecięcy/młodzieńczy · Th IV', placeholder: '(z danych: 12,0)', nota: r2Ponizej('1,0') });
  // 4. „Wyczyść wszystkie pola”.
  await wczytajOsobe(page, D);
  await wybierzEstradiol(page, 250);
  await wpisz();
  await page.locator('#labClearBtn').click();
  await expect(pole).toHaveValue('');
  await expect(page.locator('#labSubstance')).toHaveValue('');
  await wybierzEstradiol(page, 250);
  await bezWpisu();
});

test('wybór fazy, który przestaje być dostępny, wraca do „nieznana”: faza lutealna z prolaktyny → estradiol przed progiem; postmenopauza dorosłej → pacjentka 16 lat', async ({ page }) => {
  await otworzPrzelicznik(page);
  await wczytajOsobe(page, D);
  await wybierzBadanie(page, 'prolactin', 'Prolaktyna', 300);
  await otworzPanel(page);
  await page.locator('#labOverrideCycle').selectOption('luteal');
  await expect(page.locator('#labPatientText')).toContainText('faza lutealna · nadpisanie lokalne');
  // Estradiol u tej samej pacjentki (bez menarche): zwykła faza nie działa — wybór wraca do „(nieznana)”.
  await wybierzEstradiol(page, 250);
  expect(await stan(page)).toMatchObject({ opis: 'Kobieta · 16 lat · wiek dziecięcy/młodzieńczy · Th V', faza: '', opcje: NIEZNANA_NIELETNIA_BEZ_FAZ, reset: false, zakres: 'zakres: 0–290 pmol/L' });
  // Wyszarzonej fazy nie da się wybrać; ciążę można.
  await expect(page.locator('#labOverrideCycle option[value="luteal"]')).toHaveJSProperty('disabled', true);
  await expect(page.locator('#labOverrideCycle option[value="pregnancy_t1"]')).toHaveJSProperty('disabled', false);
  // Dorosła z wybraną postmenopauzą; lokalny wiek 16 lat zatwierdzony wyjściem z pola → opcja znika, wybór „(nieznana)”.
  await wczytajOsobe(page, DOROSLA);
  await wybierzEstradiol(page, 60);
  await page.locator('#labOverrideCycle').selectOption('postmenopause');
  await expect(page.locator('#labResultSourceLine')).toContainText('0–110');
  await page.locator('#labOverrideAge').fill('16');
  await page.locator('#labOverrideAge').blur();
  expect(await stan(page)).toMatchObject({ faza: '', opcje: NIEZNANA_NIELETNIA_BEZ_FAZ, opis: 'Kobieta · 16 lat · wiek dziecięcy/młodzieńczy · nadpisanie lokalne' });
  await expect(page.locator('#labOverrideCycle option[value="postmenopause"]')).toHaveCount(0);
  // Wiek z danych wraca („Resetuj”): pełna lista dorosłej, wybór dalej „(nieznana)” — odrzucona faza nie wraca sama.
  await page.locator('#labOverrideReset').click();
  expect(await stan(page)).toMatchObject({ opis: 'Kobieta · 30 lat', faza: '', opcje: WSZYSTKIE('(nieznana)'), warianty: WARIANTY_DOROSLA });
});

test('wpisywanie wieku przez wartość pośrednią, prolaktyna: dorosła z postmenopauzą wpisuje „65” przez „6” → przy „6” opis bez postmenopauzy, wybór w selektorze zostaje i przy „65” działa znowu; zakończony wpis „15” → wybór „(domyślnie)”, opcja znika', async ({ page }) => {
  await otworzPrzelicznik(page);
  await wczytajOsobe(page, DOROSLA);
  await wybierzBadanie(page, 'prolactin', 'Prolaktyna', 300);
  await otworzPanel(page);
  const wiek = page.locator('#labOverrideAge'), faza = page.locator('#labOverrideCycle');
  await faza.selectOption('postmenopause');
  await expect(page.locator('#labPatientText')).toHaveText('Kobieta · 30 lat · postmenopauza · nadpisanie lokalne');
  await wiek.click();
  await page.keyboard.press('6');
  // Niedokończony wpis („6” = sześciolatka): opis od razu bez postmenopauzy; wybór i jego opcja zostają na liście.
  expect(await stan(page)).toMatchObject({ opis: 'Kobieta · 6 lat · wiek dziecięcy/młodzieńczy · nadpisanie lokalne', faza: 'postmenopause', opcje: WSZYSTKIE('(domyślnie)'), reset: true });
  await page.keyboard.press('5');
  // „65”: zapamiętany wybór działa znowu — bez ponownego wybierania i przed wyjściem z pola.
  expect(await stan(page)).toMatchObject({ opis: 'Kobieta · 65 lat · postmenopauza · nadpisanie lokalne', faza: 'postmenopause' });
  await page.keyboard.press('Tab');
  expect(await stan(page)).toMatchObject({ opis: 'Kobieta · 65 lat · postmenopauza · nadpisanie lokalne', faza: 'postmenopause', opcje: WSZYSTKIE('(domyślnie)') });
  // Wiek 15 lat: w trakcie wpisu jak wyżej; zakończony wpis (Tab) kasuje wybór i wyjmuje opcję z listy.
  await wiek.click();
  await page.keyboard.press('ControlOrMeta+A');
  await page.keyboard.type('15');
  expect(await stan(page)).toMatchObject({ opis: 'Kobieta · 15 lat · wiek dziecięcy/młodzieńczy · nadpisanie lokalne', faza: 'postmenopause', opcje: WSZYSTKIE('(domyślnie)') });
  await page.keyboard.press('Tab');
  expect(await stan(page)).toMatchObject({ opis: 'Kobieta · 15 lat · wiek dziecięcy/młodzieńczy · nadpisanie lokalne', faza: '', opcje: ['(domyślnie)', ...FAZY, ...CIAZA] });
  // Odrzucony wybór nie wraca sam, gdy wiek znowu jest dorosły.
  await wiek.fill('65');
  await wiek.blur();
  expect(await stan(page)).toMatchObject({ opis: 'Kobieta · 65 lat · nadpisanie lokalne', faza: '', opcje: WSZYSTKIE('(domyślnie)') });
  // Ciąża nie jest wyborem zależnym od wieku: zostaje także przy wieku 15 lat i zmienia zakres jak dotąd.
  await faza.selectOption('pregnancy_t3');
  const ciaza = (await stan(page)).zakres;
  await wiek.fill('15');
  await wiek.blur();
  expect(await stan(page)).toMatchObject({ opis: 'Kobieta · 15 lat · wiek dziecięcy/młodzieńczy · ciąża — III trymestr · nadpisanie lokalne', faza: 'pregnancy_t3', zakres: ciaza });
});

test('wpisywanie wieku i wieku menarche przez wartość pośrednią, estradiol: dorosła z fazą lutealną wpisuje „35” przez „3”; dziewczynka 16 lat poprawia menarche „11” na „10” przez „1” → w trakcie wynik bez fazy, wybór zostaje i po dokończeniu działa znowu', async ({ page }) => {
  await start(page, DOROSLA, 450);
  const wiek = page.locator('#labOverrideAge'), faza = page.locator('#labOverrideCycle'), menarche = page.locator('#labOverrideMenarcheAge');
  await faza.selectOption('luteal');
  expect(await stan(page)).toMatchObject({ opis: 'Kobieta · 30 lat · faza lutealna · nadpisanie lokalne', zakres: 'zakres: 200–770 pmol/L' });
  await wiek.click();
  await page.keyboard.press('3');
  // „3” (trzylatka): zakres dziecka, opis bez fazy; „Faza lutealna” zostaje wybrana, pozostałe zwykłe fazy są wyszarzone.
  expect(await stan(page)).toMatchObject({ opis: 'Kobieta · 3 lat · wiek dziecięcy/młodzieńczy · nadpisanie lokalne', faza: 'luteal',
    opcje: ['(nieznana)', 'Faza folikularna [wyłączona]', 'Pik owulacyjny [wyłączona]', 'Faza lutealna', ...CIAZA], status: 'Uwaga — znacznie powyżej normy', zakres: 'zakres: 0–73,5 pmol/L' });
  await page.keyboard.press('5');
  expect(await stan(page)).toMatchObject({ opis: 'Kobieta · 35 lat · faza lutealna · nadpisanie lokalne', faza: 'luteal', opcje: WSZYSTKIE('(nieznana)'),
    status: '✓ w zakresie normy', zakres: 'zakres: 200–770 pmol/L' });
  await page.keyboard.press('Tab');
  expect(await stan(page)).toMatchObject({ opis: 'Kobieta · 35 lat · faza lutealna · nadpisanie lokalne', faza: 'luteal', zakres: 'zakres: 200–770 pmol/L' });
  // Zakończony wpis 13 lat (w danych menarche 12,0 → rok od menarche): faza skasowana i wyszarzona.
  await wiek.click();
  await page.keyboard.press('ControlOrMeta+A');
  await page.keyboard.type('13');
  await page.keyboard.press('Tab');
  expect(await stan(page)).toMatchObject({ faza: '', opcje: NIEZNANA_NIELETNIA_BEZ_FAZ, nota: r2Ponizej('1,0') });

  // Dziewczynka 16 lat bez menarche w danych: wpis „11”, faza lutealna, potem poprawka wpisu na „10”.
  await wczytajOsobe(page, D);
  await wybierzEstradiol(page, 450);
  await menarche.fill('11');
  await menarche.blur();
  await faza.selectOption('luteal');
  expect(await stan(page)).toMatchObject({ opis: 'Kobieta · 16 lat · wiek dziecięcy/młodzieńczy · Th V · menarche 11,0 · faza lutealna · nadpisanie lokalne', zakres: 'zakres: 200–770 pmol/L' });
  await menarche.click();
  await page.keyboard.press('ControlOrMeta+A');
  await page.keyboard.press('Backspace');
  // Pole puste w trakcie poprawki: zakres jak bez menarche, opis bez fazy; wybór „Faza lutealna” zostaje.
  expect(await stan(page)).toMatchObject({ opis: 'Kobieta · 16 lat · wiek dziecięcy/młodzieńczy · Th V', faza: 'luteal', wpis: '', nota: R2_BRAK,
    status: '↑ powyżej normy', zakres: 'zakres: 0–290 pmol/L' });
  await page.keyboard.press('1');
  // „1” to wpis poza zakresem 2–20: nota o odrzuconym wpisie, dalej bez fazy.
  expect(await stan(page)).toMatchObject({ opis: 'Kobieta · 16 lat · wiek dziecięcy/młodzieńczy · Th V · nadpisanie lokalne', faza: 'luteal', bledny: true,
    nota: WPIS_ODRZUCONY, zakres: 'zakres: 0–290 pmol/L' });
  await page.keyboard.press('0');
  expect(await stan(page)).toMatchObject({ opis: 'Kobieta · 16 lat · wiek dziecięcy/młodzieńczy · Th V · menarche 10,0 · faza lutealna · nadpisanie lokalne', faza: 'luteal',
    bledny: false, nota: null, wiersz: 'Od menarche: 6,0 lat (≥ 5) — zakresy estradiolu jak u dorosłej.', status: '✓ w zakresie normy', zakres: 'zakres: 200–770 pmol/L' });
  await page.keyboard.press('Tab');
  expect(await stan(page)).toMatchObject({ faza: 'luteal', zakres: 'zakres: 200–770 pmol/L', opcje: NIEZNANA_NIELETNIA });
});

test('klik w wynik zaraz po polu liczbowym panelu („Wiek [lata]”, „Wiek [mies.]”, „Wiek menarche [lata]”; bez wpisu i po wpisie) → pierwszy klik kopiuje wartość: „Skopiowano: 0,45 nmol/L”', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.setViewportSize({ width: 1280, height: 3000 });
  await start(page, A, 450);
  const wszystkie = page.locator('#labShowAllToggle');
  if (await wszystkie.isVisible()) await wszystkie.click();
  const komorka = page.locator('#labResultsBody td.lab-value').first();
  await expect(komorka).toBeVisible();
  const powiadomienie = page.locator('#labToast');
  // Prawdziwy klik myszą w miejscu komórki: naciśnięcie zabiera fokus polu (blur), puszczenie musi trafić w tę samą komórkę.
  const kliknij = async (opis) => {
    await page.evaluate(() => { document.getElementById('labToast').textContent = ''; });
    const b = await komorka.boundingBox();
    await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
    await page.mouse.down();
    await page.mouse.up();
    await expect(powiadomienie, opis).toHaveText('Skopiowano: 0,45 nmol/L');
  };
  await kliknij('klik bez wcześniejszego fokusu w panelu');
  for (const pole of ['#labOverrideAge', '#labOverrideAgeMonths', '#labOverrideMenarcheAge']) {
    await page.locator(pole).focus();
    await expect(page.locator(pole)).toBeFocused();
    await kliknij(`fokus w ${pole}, bez wpisu`);
  }
  // Po wpisie: wynik przelicza się w trakcie wpisywania, a wyjście z pola (klik w wynik) już go nie rysuje ponownie.
  for (const [pole, wpis] of [['#labOverrideAgeMonths', '3'], ['#labOverrideMenarcheAge', '10,2'], ['#labOverrideAge', '15']]) {
    await page.locator(pole).focus();
    await page.keyboard.type(wpis);
    await kliknij(`wpis „${wpis}” w ${pole}`);
  }
  await expect(page.locator('#labPatientText')).toHaveText('Kobieta · 15.3 lat · wiek dziecięcy/młodzieńczy · Th V · menarche 10,2 · nadpisanie lokalne');
});

test('wpis lokalny poza zakresem albo późniejszy niż wiek (25; 1; 16,5 u 16-latki) → nota „Wpisany wiek menarche nie jest brany pod uwagę…”, pole oznaczone, zakres jak bez wpisu, opis „… · nadpisanie lokalne” bez „menarche 25,0”; także na 390 px', async ({ page }) => {
  await start(page, { ...D, menarche: 11 }, 250);
  const pole = page.locator('#labOverrideMenarcheAge');
  // W danych jest menarche 11,0 (po progu) — odrzucony wpis lokalny i tak zastępuje dane: liczy się jak brak wpisu.
  expect(await stan(page)).toMatchObject({ wiersz: R1_ZMIEN, placeholder: '(z danych: 11,0)' });
  for (const wpis of ['25', '1', '16,5']) {
    await pole.fill(wpis);
    expect(await stan(page), wpis).toMatchObject({
      opis: 'Kobieta · 16 lat · wiek dziecięcy/młodzieńczy · Th V · nadpisanie lokalne', wiersz: null,
      opcje: NIEZNANA_NIELETNIA_BEZ_FAZ, bledny: true, nota: WPIS_ODRZUCONY, reset: true, status: '✓ w zakresie normy', zakres: 'zakres: 0–290 pmol/L',
    });
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator('#labOverrideMenarcheNote')).toBeVisible();
  await expect(page.locator('#labOverrideMenarcheNote')).toHaveText(WPIS_ODRZUCONY);
  expect(await bezPoziomegoPrzewijania(page)).toBe(true);
  await page.setViewportSize({ width: 1440, height: 1000 });
  // Poprawny wpis zdejmuje notę i oznaczenie; skasowany wpis wraca do wartości z danych.
  await pole.fill('12');
  expect(await stan(page)).toMatchObject({ opis: 'Kobieta · 16 lat · wiek dziecięcy/młodzieńczy · Th V · menarche 12,0 · nadpisanie lokalne', bledny: false, nota: r2Ponizej('4,0') });
  await pole.fill('');
  expect(await stan(page)).toMatchObject({ opis: 'Kobieta · 16 lat · wiek dziecięcy/młodzieńczy · Th V', bledny: false, nota: null, wiersz: R1_ZMIEN, placeholder: '(z danych: 11,0)', reset: false });
  // „Resetuj do danych pacjenta” kasuje także odrzucony wpis.
  await pole.fill('25');
  await page.locator('#labOverrideReset').click();
  await expect(pole).toHaveValue('');
  expect(await stan(page)).toMatchObject({ bledny: false, nota: null, wiersz: R1_ZMIEN, reset: false });
});

test('wpis, który nie jest zwykłą liczbą dziesiętną („12,5,”; „12,5 lat”; „12;5”; „1e1”; „0x10”; „-12”) → wpis odrzucony: zastępuje wartość z danych, nota i oznaczenie pola; „11”, „11,0”, „ 10.5 ” → przyjęte', async ({ page }) => {
  // W danych menarche 11,0 (po progu u 16-latki): każdy niepusty wpis je zastępuje — nierozpoznany nie wraca do danych.
  await start(page, { ...D, menarche: 11 }, 250);
  const pole = page.locator('#labOverrideMenarcheAge');
  for (const wpis of ['12,5,', '12,5 lat', '12;5', '1e1', '0x10', '-12', '+11', '11,', ',5', '11,005', 'jedenaście']) {
    await pole.fill(wpis);
    expect(await stan(page), wpis).toMatchObject({
      opis: 'Kobieta · 16 lat · wiek dziecięcy/młodzieńczy · Th V · nadpisanie lokalne', wiersz: null, wpis,
      opcje: NIEZNANA_NIELETNIA_BEZ_FAZ, bledny: true, nota: WPIS_ODRZUCONY, reset: true, status: '✓ w zakresie normy', zakres: 'zakres: 0–290 pmol/L', warianty: [],
    });
  }
  for (const [wpis, opis, wiersz] of [['11', 'menarche 11,0', R1_ZMIEN], ['11,0', 'menarche 11,0', R1_ZMIEN], [' 10.5 ', 'menarche 10,5', R1_ZMIEN.replace('5,0 lat', '5,5 lat')],
    ['10,25', 'menarche 10,25', R1_ZMIEN.replace('5,0 lat', '5,7 lat')]]) {
    await pole.fill(wpis);
    expect(await stan(page), wpis).toMatchObject({
      opis: `Kobieta · 16 lat · wiek dziecięcy/młodzieńczy · Th V · ${opis} · nadpisanie lokalne`, wiersz, bledny: false, nota: null, reset: true,
      opcje: NIEZNANA_NIELETNIA, status: '', warianty: WARIANTY_NIELETNIA,
    });
  }
});

test('opis pacjenta przy wpisie, który nie jest używany: wiek nadpisany na 30 lat (pole schowane) i prolaktyna (pole nie dotyczy) → bez „menarche …”; powrót do estradiolu u 16-latki → „menarche 11,0 · nadpisanie lokalne”', async ({ page }) => {
  await start(page, D, 250);
  const pole = page.locator('#labOverrideMenarcheAge'), wiek = page.locator('#labOverrideAge');
  await pole.fill('11');
  await pole.blur();
  expect(await stan(page)).toMatchObject({ opis: 'Kobieta · 16 lat · wiek dziecięcy/młodzieńczy · Th V · menarche 11,0 · nadpisanie lokalne', reset: true });
  // Wiek 30 lat w panelu: dorosła — pole schowane, wpis nieużywany; nadpisaniem jest sam wiek.
  await wiek.fill('30');
  await wiek.blur();
  const dorosla = await stan(page);
  expect(dorosla).toMatchObject({ pole: false, nota: null, reset: true, wiersz: WSKAZOWKA_DOROSLA, naglowek: NAGLOWEK_DOROSLA, warianty: WARIANTY_DOROSLA });
  expect(dorosla.opis).toMatch(/^Kobieta · 30 lat · .*nadpisanie lokalne$/);
  expect(dorosla.opis).not.toContain('menarche');
  // Wiek z danych wraca (pole wieku wyczyszczone): wpis menarche znowu działa i jest ogłaszany.
  await wiek.fill('');
  await wiek.blur();
  expect(await stan(page)).toMatchObject({ opis: 'Kobieta · 16 lat · wiek dziecięcy/młodzieńczy · Th V · menarche 11,0 · nadpisanie lokalne', pole: true, wiersz: R1_ZMIEN });
  // Prolaktyna: pole nie dotyczy badania — wpis nie jest ani wartością w opisie, ani nadpisaniem.
  await wybierzBadanie(page, 'prolactin', 'Prolaktyna', 300);
  expect(await stan(page)).toMatchObject({ opis: 'Kobieta · 16 lat · wiek dziecięcy/młodzieńczy · Th V', pole: false, reset: false });
  await wybierzEstradiol(page, 250);
  expect(await stan(page)).toMatchObject({ opis: 'Kobieta · 16 lat · wiek dziecięcy/młodzieńczy · Th V · menarche 11,0 · nadpisanie lokalne', pole: true, reset: true });
});

test('zmiana płci w danych tej samej osoby (K → M → K, bez sejfu): lokalny wiek menarche i wybrana faza porzuconego kontekstu nie wracają → pole puste, zakres jak bez wpisu', async ({ page }) => {
  await otworzGoscia(page);
  await daneGoscia(page, { lata: 16 });
  await wybierzEstradiol(page, 250);
  await otworzPanel(page);
  const pole = page.locator('#labOverrideMenarcheAge');
  expect(await stan(page)).toMatchObject({ opis: 'Kobieta · 16 lat · wiek dziecięcy/młodzieńczy', pole: true, nota: R2_BRAK, zakres: 'zakres: 0–290 pmol/L' });
  await pole.fill('11');
  await pole.blur();
  await page.locator('#labOverrideCycle').selectOption('luteal');
  expect(await stan(page)).toMatchObject({ opis: 'Kobieta · 16 lat · wiek dziecięcy/młodzieńczy · menarche 11,0 · faza lutealna · nadpisanie lokalne', zakres: 'zakres: 200–770 pmol/L' });
  // Płeć poprawiona w danych na „M” (ta sama osoba): pole i selektor fazy znikają.
  await daneGoscia(page, { lata: 16, plec: 'M' });
  await expect(page.locator('#labPatientText')).toContainText('Mężczyzna · 16 lat · wiek dziecięcy/młodzieńczy');
  await expect(page.locator('#labOverrideMenarcheWrap')).toBeHidden();
  await expect(page.locator('#labOverrideCycleWrap')).toBeHidden();
  await expect(pole).toHaveValue('');
  await expect(page.locator('#labOverrideCycle')).toHaveValue('');
  // Płeć wraca na „K”: nic z porzuconego kontekstu nie ożywa.
  await daneGoscia(page, { lata: 16 });
  await expect(page.locator('#labPatientText')).toHaveText('Kobieta · 16 lat · wiek dziecięcy/młodzieńczy');
  await expect(pole).toHaveValue('');
  expect(await stan(page)).toMatchObject({ faza: '', wpis: '', pole: true, nota: R2_BRAK, reset: false, opcje: NIEZNANA_NIELETNIA_BEZ_FAZ, zakres: 'zakres: 0–290 pmol/L' });
});

test('inhibina B i LH (własny formularz, selektor fazy schowany): postmenopauza wybrana u 40-latki w prolaktynie, potem dane tej samej osoby zmieniają się na 12 lat → schowany wybór skasowany; inhibina B 40 ng/L na karcie „Hormony w ciągu życia” jak u świeżo otwartej 12-latki', async ({ page }) => {
  await otworzGoscia(page);
  const gotowa = () => page.waitForFunction(() => window.VildaPersistence && window.LabUnitConverter && window.VildaHormoneLifespanRuntime);
  const wybor = () => page.locator('#labOverrideCycle').inputValue();
  // Ta sama osoba (tryb bez sejfu): 40 lat i postmenopauza wybrana w prolaktynie, potem badanie z własnym formularzem.
  const poZmianieDanych = async (badanie, szukaj, wartosc) => {
    await page.reload({ waitUntil: 'load' });
    await gotowa();
    await daneGoscia(page, { lata: 40 });
    await wybierzBadanie(page, 'prolactin', 'Prolaktyna', 300);
    await otworzPanel(page);
    await page.locator('#labOverrideCycle').selectOption('postmenopause');
    await expect(page.locator('#labPatientText')).toHaveText('Kobieta · 40 lat · postmenopauza · nadpisanie lokalne');
    await wybierzBadanie(page, badanie, szukaj);
    // U dorosłej wybór zostaje (selektor jest schowany, ale karta z niego korzysta).
    expect(await wybor()).toBe('postmenopause');
    await daneGoscia(page, { lata: 12 });
    await page.locator('#labValue').fill(String(wartosc));
    await expect.poll(() => wykresHormonow(page)).toContain('12 lat');
  };
  await poZmianieDanych('inhibin_b', 'Inhibina B', 40);
  await expect.poll(() => wykresHormonow(page)).toContain('40 ng/L');
  const poWyborze = await wykresHormonow(page);
  expect(await wybor()).toBe('');
  expect(poWyborze).toContain('40 ng/L Mediana ≈43 ng/L');
  expect(poWyborze).not.toContain('Brak odrębnego odniesienia dla ciąży lub okresu po menopauzie');
  // Świeżo otwarta 12-latka, bez wcześniejszych 40 lat i bez żadnego wyboru: ta sama karta.
  await page.reload({ waitUntil: 'load' });
  await gotowa();
  await daneGoscia(page, { lata: 12 });
  await wybierzBadanie(page, 'inhibin_b', 'Inhibina B', 40);
  await expect.poll(() => wykresHormonow(page)).toContain('40 ng/L');
  expect(await wykresHormonow(page)).toBe(poWyborze);
  // LH: ten sam schowany wybór jest kasowany. (Karty LH nie porównujemy: zapamiętuje etap życia z pierwszego rysowania.)
  await poZmianieDanych('lh', 'LH', 5);
  expect(await wybor()).toBe('');
  // Powrót do badania z widocznym selektorem: 12-latka nie ma ani wyboru, ani opcji „Postmenopauza”.
  await wybierzBadanie(page, 'prolactin', 'Prolaktyna', 300);
  expect(await stan(page)).toMatchObject({ opis: 'Kobieta · 12 lat · wiek dziecięcy/młodzieńczy', faza: '', opcje: ['(domyślnie)', ...FAZY, ...CIAZA], reset: false });
});

test('telefon 390 px: stan A (wiersz o menarche, pole, trzy warianty) i stan C (pole, nota) → wszystko widoczne, bez poziomego przewijania', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await start(page, A, 450);
  expect(await stan(page)).toMatchObject({ wiersz: R1_ZMIEN, pole: true, placeholder: '(z danych: 10,0)', warianty: WARIANTY_NIELETNIA, nota: null });
  for (const element of ['#labClinicalHint', '#labOverrideMenarcheWrap', '#labOverrideMenarcheAge', '#labRangeBlock [data-reference-variants]']) {
    await expect(page.locator(element), element).toBeVisible();
  }
  expect(await bezPoziomegoPrzewijania(page)).toBe(true);
  // Pole nie wystaje poza panel, a „(≥ 5)” stoi w jednym wierszu.
  const [panel, pole] = [await page.locator('#labPatientOverride').boundingBox(), await page.locator('#labOverrideMenarcheAge').boundingBox()];
  expect(pole.x).toBeGreaterThanOrEqual(panel.x);
  expect(pole.x + pole.width).toBeLessThanOrEqual(panel.x + panel.width + 0.5);
  expect(await page.locator('#labClinicalHint').evaluate((el) => {
    const wezel = el.firstChild, od = el.textContent.indexOf('(≥'), zakres = document.createRange();
    zakres.setStart(wezel, od); zakres.setEnd(wezel, od + '(≥ 5)'.length);
    return zakres.getClientRects().length;
  })).toBe(1);
  await wczytajOsobe(page, C);
  await wybierzEstradiol(page, 150);
  expect(await stan(page)).toMatchObject({ wiersz: null, pole: true, placeholder: '(z danych: 12,0)', nota: r2Ponizej('1,0'), zakres: 'zakres: 55,1–312 pmol/L' });
  await expect(page.locator('#labOverrideMenarcheNote')).toBeVisible();
  await expect(page.locator('#labOverrideMenarcheAge')).toBeVisible();
  expect(await bezPoziomegoPrzewijania(page)).toBe(true);
});

test('F: pakiet Estradiol + TSH, pacjentka A (15 lat, menarche 10,0), E2 450 pmol/L → karta bez oceny, dwie noty i łącze do pojedynczego badania; wiersz „Pokwitanie” nie wymienia Estradiolu', async ({ page }) => {
  await otworzPrzelicznik(page);
  await wczytajOsobe(page, A);
  await page.locator('#labModePackage').click();
  await utworzPakiet(page, 'Kontrola (fikcyjna)', ['estradiol', 'tsh']);
  await expect(page.locator('#labPkgPatient')).toContainText('Kobieta · 15 lat');
  await page.locator('#labPkgValue-estradiol').fill('450');
  await page.locator('#labPkgValue-tsh').fill('2,1');
  const karta = kartaPakietu(page).locator('.lab-pkg-card[data-analyte="estradiol"]');
  await expect(karta.locator('.lab-range-status')).toHaveText('bez oceny względem zakresu');
  expect(await karta.locator('.lab-pkg-card-note').evaluateAll((noty) => noty.map((n) => n.textContent.replace(/\u00a0/g, ' ')))).toEqual([
    'Ocena wymaga kontekstu badania (np. fazy cyklu) — wybierzesz go w pojedynczym badaniu.', R1,
  ]);
  expect(await tekst(karta)).toBe('Estradiol 450 pmol/L bez oceny względem zakresu Ocena wymaga kontekstu badania (np. fazy cyklu) — wybierzesz go w pojedynczym badaniu. '
    + R1 + ' Oceń Estradiol w pojedynczym badaniu →');
  await expect(karta.locator('.lab-pkg-bar')).toHaveCount(0);
  await expect(karta.locator('.lab-pkg-card-norm')).toHaveCount(0);
  // Stadium nie dobiera już normy żadnego badania tego pakietu: wiersz „Pokwitanie” jest schowany.
  await expect(page.locator('#labPkgPuberty')).toBeHidden();
  expect(await tekst(kartaPakietu(page).locator('.lab-pkg-card[data-analyte="tsh"]'))).toBe('TSH 2,1 mIU/L w zakresie normy Norma · Młodzież 11–19 lat: 0,5–4,3 mIU/L');
  // Łącze prowadzi do pojedynczego badania z estradiolem i tym samym wierszem o menarche.
  await karta.getByRole('button', { name: 'Oceń Estradiol w pojedynczym badaniu →' }).click();
  await expect(page.locator('#labFormPane')).toBeVisible();
  await expect(page.locator('#labSubstance')).toHaveValue('Estradiol (E2)');
  await expect(page.locator('#labClinicalHint')).toHaveText(R1_ZMIEN.replace('(≥ 5)', '(≥ 5)'));
});

test('pakiet Estradiol + TSH, pacjentka C (13 lat, menarche rok temu), E2 150 pmol/L → jak dotąd: ocena zakresem Tannera IV, wiersz „Pokwitanie” wymienia Estradiol', async ({ page }) => {
  await otworzPrzelicznik(page);
  await wczytajOsobe(page, C);
  await page.locator('#labModePackage').click();
  await utworzPakiet(page, 'Kontrola (fikcyjna)', ['estradiol', 'tsh']);
  await expect(page.locator('#labPkgPatient')).toContainText('Kobieta · 13 lat');
  await page.locator('#labPkgValue-estradiol').fill('150');
  const karta = kartaPakietu(page).locator('.lab-pkg-card[data-analyte="estradiol"]');
  expect(await tekst(karta)).toBe('Estradiol 150 pmol/L w zakresie normy Norma · Dziewczynki Tanner IV: 55,1–312 pmol/L');
  await expect(karta.locator('.lab-pkg-card-note')).toHaveCount(0);
  await expect(page.locator('#labPkgPuberty')).toBeVisible();
  expect(await tekst(page.locator('#labPkgPuberty'))).toContain('Stadium dobiera normę według Tannera: Estradiol.');
});

test('przypięcie: 15 lat, menarche 10,0, faza lutealna, E2 450 pmol/L → zapis z użytym zakresem dorosłej; historia czyta go z zapisu, a dawny zapis pediatryczny „powyżej 0–290” zostaje bez zmian', async ({ page }) => {
  const patientId = await start(page, A, 450);
  // Dawny wpis tej pacjentki sprzed reguły: zakres pediatryczny Tanner V i kategoria „powyżej” zapisane z wynikiem.
  await page.evaluate(async (pid) => {
    const converter = window.LabUnitConverter, e2 = converter.find('estradiol');
    const row = e2.reference_ranges_si.find((entry) => entry.id === 'e2_F_tanner5');
    const range = { id: row.id, low: row.low, high: row.high, context_pl: row.context_pl, source_ids: row.source_ids.slice(), no_interpretation: false, matched: true, is_default: false };
    const patient = { sex: 'F', age: 15, life_stage: 'pediatric', tanner: 5 };
    const dawny = window.VildaLabRangeSnapshot.create({
      analyte: 'estradiol', range, when: row.when, patient,
      evaluation: { ok: true, substanceId: 'estradiol', value: 450, unit: 'pmol/L', siValue: 450, siUnit: 'pmol/L', low: row.low, high: row.high,
        context_pl: row.context_pl, status: 'above' },
      factorToSi: 1, measurement: { raw: '450', sourceUnit: 'pmol/L' },
      sources: row.source_ids.map((id) => ({ id, label: converter.findSource(id).label_short, citation: converter.findSource(id).full_cite, url: converter.findSource(id).url })),
      versions: { engine: 'LabUnitConverter 2.0.3', data: 'LabUnitsData 2.0.2' }, capturedAtISO: '2026-05-20T10:00:00.000Z',
    });
    if (dawny.status !== 'recorded') throw new Error('Nie udało się zbudować dawnego zapisu: ' + JSON.stringify(dawny.reasonCodes));
    await window.VildaVault.savePatientNote({ patientId: pid, title: 'Fikcyjny estradiol', body: '', category: 'wynik-badania', clinicalDateISO: '2026-05-20',
      labResult: { test: 'Estradiol (E2)', testKey: 'estradiol', value: '450 pmol/L', valueNum: 450, unit: 'pmol/L', range: dawny } });
  }, patientId);
  await page.locator('#labOverrideCycle').selectOption('luteal');
  await expect(page.locator('#labResultStatus')).toContainText('w zakresie normy');
  await page.locator('#labPinResultBtn').click();
  expect(await tekst(page.locator('#labPinRange'))).toBe('Zapisze się z wynikiem: w zakresie 200–770 pmol/L Kobiety, faza lutealna · dobrano dla: dziewczynka, 15 l, Tanner V (ustawione w przeliczniku) · Tietz 2018');
  await page.locator('#labPinDate').fill('2026-06-17');
  await page.locator('#labPinSave').click();
  await expect(page.locator('#labPinOverlay')).toHaveCount(0);
  const zapisy = () => page.evaluate(async (pid) => (await window.VildaVault.listPatientNotesForPatient(pid))
    .filter((n) => n.labResult && n.labResult.testKey === 'estradiol').sort((a, b) => a.clinicalDateISO.localeCompare(b.clinicalDateISO))
    .map((n) => ({ data: n.clinicalDateISO, range: n.labResult.range })), patientId);
  const [dawny, nowy] = await zapisy();
  expect(nowy).toMatchObject({ data: '2026-06-17', range: { status: 'recorded', classification: 'within', analyte: 'estradiol',
    context: { sex: 'F', ageYears: 15, lifeStage: 'pediatric', tanner: 5, cyclePhase: 'luteal', localOverride: true },
    range: { id: 'e2_female_luteal', low: 200, high: 770, context: 'Kobiety, faza lutealna', when: { sex: 'F', life_stage: 'adult', cycle_phase: 'luteal' } },
    versions: { engine: 'LabUnitConverter 2.0.4' } } });
  // Format zapisu bez zmian: te same pola kontekstu co w dawnym wpisie (podstawa „lata od menarche” nie jest zapisywana).
  expect(Object.keys(nowy.range.context)).toEqual(Object.keys(dawny.range.context));
  expect(dawny).toMatchObject({ data: '2026-05-20', range: { status: 'recorded', classification: 'above', range: { id: 'e2_F_tanner5', low: 0, high: 290 } } });
  // Pasek poprzednich wyników w przeliczniku czyta zapis: dawny wpis nadal ze strzałką, nowy bez.
  await expect(pasekHistorii(page).locator('button.lab-strip-chip[data-note-id] .lab-strip-chip-v')).toHaveText(['450↑', '450']);
  // Zakładka „Badania”: oba wpisy czytane z zapisu — nowy w zakresie dorosłej, dawny nadal „↑” względem 0–290 (bez ponownej oceny).
  await otworzBadania(page, patientId);
  const wiersze = sekcjaBadan(page).locator('.vilda-lab-hist-result-row[data-series="estradiol"]');
  await expect(wiersze).toHaveCount(2);
  expect(await wiersze.evaluateAll((rows) => rows.map((r) => r.innerText.replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim())))
    .toEqual(['Estradiol 450 pmol/L 200–770 pmol/L ›', 'Estradiol 450 pmol/L ↑ 0–290 pmol/L ›']);
  await wiersze.first().click();
  const szczegoly = page.locator('.vilda-lab-hist-result-details');
  await szczegoly.locator('.vilda-lab-hist-result-sources > summary').click();
  expect(await tekst(szczegoly.locator('.vilda-lab-hist-status.is-range .vilda-lab-hist-status-text'))).toBe('w zapisanym zakresie · 200–770 pmol/L');
  await expect(szczegoly.locator('.vilda-lab-hist-status.is-range .vilda-lab-hist-status-context'))
    .toHaveText('Kobiety, faza lutealna · dziewczynka, 15 l, Tanner V (ustawione w przeliczniku) · Tietz 2018');
  // Odczyt historii niczego nie przelicza ani nie przepisuje w zapisanych wpisach.
  expect(await zapisy()).toEqual([dawny, nowy]);
});
