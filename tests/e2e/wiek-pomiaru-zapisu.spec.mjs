import { expect, test } from '../support/test-czas.mjs';

// P-WIEK-POMIARU (decyzja właściciela 2026-10-13, wariant B): zapisany pomiar liczy się w wieku z dnia TEGO pomiaru.
//
// Przed zmianą bramka DOB-AGE-4 (`lmsNiemowleWiek`) dawała zapisanemu pomiarowi z tego samego miesiąca życia
// dzisiejszy dokładny wiek z formularza. Noworodek na medianie WHO zmierzony w 7. dobie i oglądany w 28. dobie
// wychodził w kolumnie „Poprzednio”, na kafelkach Karty pacjenta i w schowku na 4. centylu długości zamiast 50.
// Karta pacjenta brała przy tym datę urodzenia z formularza, także gdy pokazywała innego pacjenta.
//
// Po zmianie te trzy widoki liczą dokładny wiek z daty urodzenia rekordu i daty pomiaru (reguła P-ODTWORZ-WIEK).
// Bez pewnej doby pomiaru liczą pełne miesiące z rekordu, nigdy wiek dzisiejszy. Wartości oczekiwane liczy
// w teście bezpośrednio silnik (`VildaSdsWzrostu`, `VildaBmi`) albo dotychczasowa ścieżka bieżącego pomiaru
// (bramka z podstawionym wiekiem) — nie zmieniana tu ścieżka zapisu.
//
// Zegar strony: 17 czerwca 2026 (tests/support/czas.mjs). Dane FIKCYJNE.
test.use({ serviceWorkers: 'block' });

const HASLO = 'E2e#WiekPomiaru!26';
const DNI_W_MIES = 30.4375;

async function otworzZKontem(page) {
  await page.addInitScript(() => {
    try {
      window.localStorage.setItem('vilda-terms-accepted-v1', JSON.stringify({ version: 1, acceptedAtISO: new Date().toISOString() }));
    } catch (_) { /* brak storage — pomiń */ }
  });
  await page.goto('/index.html', { waitUntil: 'load' });
  await page.waitForFunction(() => Boolean(window.VildaVault));
  await page.evaluate(async (pw) => window.VildaVault.createUser(pw, { label: 'e2e', iterations: 10000 }), HASLO);
  await page.reload({ waitUntil: 'load' });
  await page.waitForFunction(() => Boolean(window.VildaVault) && window.VildaVault.isUnlocked()
    && !document.documentElement.classList.contains('vilda-auth-locked')
    && Boolean(window.VildaAuthUI) && typeof window.calcPercentileStats === 'function'
    && Boolean(window.VildaPatientSummaryCopy) && Boolean(window.VildaDobAge), null, { timeout: 30000 });
}

// Zapis pomiaru tak, jak trzyma go sejf: wiek z chwili pomiaru, data pomiaru, źródło siatek.
async function zalozPacjenta(page, d) {
  return page.evaluate(async (p) => {
    const user = {
      lastName: p.nazwisko, firstName: p.imie, sex: p.plec, dobISO: p.dobISO,
      age: p.lata, ageMonths: p.mies, height: p.wzrost, weight: p.masa,
    };
    if (p.dataPomiaru) user.measuredAtISO = p.dataPomiaru;
    if (p.tygodnie != null) user.ageWeeks = p.tygodnie;
    const w = await window.VildaVault.savePatient({
      name: `${p.nazwisko} ${p.imie}`, timestampISO: p.zapisISO, zscore: { dataSource: p.zrodlo }, user,
    }, { dedup: false });
    return w.patientId;
  }, d);
}

// Centyle „wzorcowe” w zadanym wieku ułamkowym: wzrost i BMI wprost z silników, masa dotychczasową ścieżką
// bieżącego pomiaru (bramka DOB-AGE-4 z podstawionym wiekiem formularza).
const wzorzec = (page, { plec, wiekMies, pelneMies, wzrost, masa, zrodlo }) => page.evaluate((a) => {
  const D = window.VildaDobAge;
  const oryg = D.readExactAge;
  const dawnyZrodlo = window.bmiSource;
  try {
    window.bmiSource = a.zrodlo;
    D.readExactAge = () => ({ totalMonths: a.pelneMies, days: Math.round(a.wiekMies * a.DNI), exactMonths: a.wiekMies });
    const ht = window.VildaSdsWzrostu.policz({ wzrost: a.wzrost, plec: a.plec, wiekMies: a.wiekMies, zrodlo: a.zrodlo });
    const wt = window.calcPercentileStats(a.masa, a.plec, a.pelneMies / 12, 'WT');
    const bmiWartosc = a.masa / Math.pow(a.wzrost / 100, 2);
    const bmi = window.VildaBmi.ocen({ bmi: bmiWartosc, plec: a.plec, wiekMies: a.wiekMies, zrodlo: a.zrodlo });
    const cole = window.VildaBmi.cole({ bmi: bmiWartosc, plec: a.plec, wiekMies: a.wiekMies, zrodlo: a.zrodlo });
    return {
      ht: Math.round(ht.centyl),
      wt: wt ? Math.round(wt.percentile) : null,
      bmi: Math.round(bmi.centyl),
      cole: cole && Number.isFinite(cole.cole) ? `${cole.cole.toFixed(1).replace('.', ',')}%` : null,
    };
  } finally {
    D.readExactAge = oryg;
    window.bmiSource = dawnyZrodlo;
  }
}, { plec, wiekMies, pelneMies, wzrost, masa, zrodlo, DNI: DNI_W_MIES });

const wpisz = (page, pola) => page.evaluate((p) => {
  Object.keys(p).forEach((id) => {
    const el = document.getElementById(id);
    if (!el) throw new Error('brak pola ' + id);
    el.value = p[id];
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  });
}, pola);

async function otworzKarte(page, pid) {
  await page.evaluate((id) => window.VildaAuthUI.showPatientCard(id, (r) => { if (r) window.applyLoadedData(r); }, null), pid);
  await expect(page.locator('.vilda-patient-stat-label', { hasText: 'Wzrost' }).first()).toBeVisible({ timeout: 20000 });
}

async function wczytajJakoNowyPomiar(page, pid) {
  await otworzKarte(page, pid);
  await page.getByRole('button', { name: 'Wczytaj tego pacjenta' }).click();
  await page.waitForSelector('#vildaLoadChoiceModal', { state: 'visible', timeout: 8000 });
  await page.click('#vildaLcmNew');
  await page.waitForSelector('#vildaLoadChoiceModal', { state: 'detached', timeout: 8000 }).catch(() => {});
  await expect(page.locator('#prevSummaryWrap')).toBeVisible({ timeout: 20000 });
}

const liczbaCentyla = (tekst) => {
  const m = /(\d+)\.? centyl/.exec(String(tekst || ''));
  return m ? Number(m[1]) : null;
};
const kolumnaPoprzednio = (page, klucz) => page.locator(`#prevSummaryContent tr[data-klucz="${klucz}"] .pt-kol-poprzednio`);
const centylPoprzednio = async (page, klucz) => liczbaCentyla(await kolumnaPoprzednio(page, klucz).innerText());
const kafelek = (page, etykieta) => page.locator('.vilda-patient-stat')
  .filter({ has: page.locator('.vilda-patient-stat-label', { hasText: etykieta }) }).first();
const centylKafelka = async (page, etykieta) => liczbaCentyla(await kafelek(page, etykieta).innerText());
const schowek = (page, pid) => page.evaluate(async (id) => {
  const p = await window.VildaVault.getPatient(id);
  return window.VildaPatientSummaryCopy.buildSummaryTextFromPayload(p.snapshots[0].payload, {});
}, pid);
const centylSchowka = (tekst, etykieta) => liczbaCentyla((String(tekst).split('\n').find((l) => l.startsWith(`${etykieta}:`)) || ''));

// Chłopiec ur. 20 maja 2026: pomiar 27 maja (7. doba), dziś 17 czerwca (28. doba) — oba w 0. pełnym miesiącu.
// Długość i masa leżą na medianie WHO dla 7. doby.
const NOWORODEK = {
  nazwisko: 'Probny', imie: 'Niemowlak', plec: 'M', dobISO: '2026-05-20', dataPomiaru: '2026-05-27',
  zapisISO: '2026-05-27T09:00:00.000Z', lata: 0, mies: 0, tygodnie: 1, wzrost: 51, masa: 3.61, zrodlo: 'WHO',
};

test('noworodek WHO: karta porównania, Karta pacjenta i schowek liczą pomiar z 7. doby w 7. dobie, nie w dzisiejszej', async ({ page }) => {
  test.setTimeout(150_000);
  await otworzZKontem(page);
  const pid = await zalozPacjenta(page, NOWORODEK);

  const wDniuPomiaru = await wzorzec(page, { plec: 'M', wiekMies: 7 / DNI_W_MIES, pelneMies: 0, wzrost: 51, masa: 3.61, zrodlo: 'WHO' });
  const naDzis = await wzorzec(page, { plec: 'M', wiekMies: 28 / DNI_W_MIES, pelneMies: 0, wzrost: 51, masa: 3.61, zrodlo: 'WHO' });
  expect(wDniuPomiaru.ht, 'długość dobrana na medianę 7. doby').toBe(50);
  expect(wDniuPomiaru.wt, 'masa dobrana na medianę 7. doby').toBe(50);
  expect(naDzis.ht, 'dzisiejszy wiek faktycznie zaniża centyl — test mierzy błąd, nie szum').toBeLessThan(10);
  expect(naDzis.wt).toBeLessThan(15);

  await wczytajJakoNowyPomiar(page, pid);
  await expect(page.locator('#dobInput'), 'formularz ma datę urodzenia, więc bramka dzisiejszego wieku jest czynna').toHaveValue('20-05-2026');
  await expect.poll(() => centylPoprzednio(page, 'wzrost'), { timeout: 15000 }).toBe(wDniuPomiaru.ht);
  expect(await centylPoprzednio(page, 'masa'), 'masa „Poprzednio”').toBe(wDniuPomiaru.wt);
  expect(await centylPoprzednio(page, 'bmi'), 'BMI „Poprzednio” na tym samym wieku').toBe(wDniuPomiaru.bmi);
  expect(wDniuPomiaru.cole, 'Cole liczony przez silnik').not.toBeNull();
  await expect(kolumnaPoprzednio(page, 'cole'), 'Cole „Poprzednio” na tym samym wieku').toContainText(wDniuPomiaru.cole);

  // Karta pacjenta tego samego pacjenta, gdy formularz go trzyma (data urodzenia w formularzu).
  await otworzKarte(page, pid);
  expect(await centylKafelka(page, 'Wzrost'), 'kafelek „Wzrost”').toBe(wDniuPomiaru.ht);
  expect(await centylKafelka(page, 'Waga'), 'kafelek „Waga”').toBe(wDniuPomiaru.wt);
  expect(await centylKafelka(page, 'BMI'), 'kafelek „BMI”').toBe(wDniuPomiaru.bmi);
  await expect(kafelek(page, 'Cole'), 'kafelek Cole’a').toContainText(wDniuPomiaru.cole);

  // „Skopiuj podsumowanie wyników” — ten sam zapis, te same liczby.
  const tekst = await schowek(page, pid);
  expect(centylSchowka(tekst, 'Wzrost'), tekst).toBe(wDniuPomiaru.ht);
  expect(centylSchowka(tekst, 'Waga'), tekst).toBe(wDniuPomiaru.wt);
  expect(centylSchowka(tekst, 'BMI'), tekst).toBe(wDniuPomiaru.bmi);
  expect(tekst, 'Cole w schowku').toContain(`Wskaźnik Cole’a: ${wDniuPomiaru.cole}`);
});

test('Karta pacjenta innego niż w formularzu liczy datą urodzenia własnego rekordu, nie formularza', async ({ page }) => {
  test.setTimeout(120_000);
  await otworzZKontem(page);
  const pid = await zalozPacjenta(page, NOWORODEK);
  // Formularz trzyma innego, fikcyjnego noworodka (ur. 25 maja, dziś 23. doba, też 0. pełny miesiąc).
  await wpisz(page, { lastName: 'Inny', firstName: 'Fikcyjny', dobInput: '25-05-2026', sex: 'M' });
  await expect.poll(() => page.evaluate(() => {
    const e = window.VildaDobAge.readExactAge();
    return e ? `${e.totalMonths}/${e.days}` : null;
  })).toBe('0/23');

  const wDniuPomiaru = await wzorzec(page, { plec: 'M', wiekMies: 7 / DNI_W_MIES, pelneMies: 0, wzrost: 51, masa: 3.61, zrodlo: 'WHO' });
  const wiekInnego = await wzorzec(page, { plec: 'M', wiekMies: 23 / DNI_W_MIES, pelneMies: 0, wzrost: 51, masa: 3.61, zrodlo: 'WHO' });
  expect(wiekInnego.ht, 'wiek pacjenta z formularza dałby inny centyl').toBeLessThan(20);

  await otworzKarte(page, pid);
  expect(await centylKafelka(page, 'Wzrost')).toBe(wDniuPomiaru.ht);
  expect(await centylKafelka(page, 'Waga')).toBe(wDniuPomiaru.wt);
  const tekst = await schowek(page, pid);
  expect(centylSchowka(tekst, 'Wzrost'), tekst).toBe(wDniuPomiaru.ht);
});

test('bez pewnej doby pomiaru zapis liczy pełne miesiące z rekordu — nigdy wiek dzisiejszy', async ({ page }) => {
  test.setTimeout(120_000);
  await otworzZKontem(page);
  // Wizyta z 7. doby zapisana ponownie starym kodem dziś: bez daty pomiaru, chwila zapisu = dziś, tygodnie z dnia
  // pomiaru (1). Doba z chwili zapisu nie zgadza się z tygodniami, więc jej nie zgadujemy (P-ODTWORZ-WIEK).
  const pid = await zalozPacjenta(page, { ...NOWORODEK, dataPomiaru: null, zapisISO: '2026-06-17T09:00:00.000Z' });
  await wpisz(page, { lastName: 'Probny', firstName: 'Niemowlak', dobInput: '20-05-2026', sex: 'M' });
  await expect.poll(() => page.evaluate(() => (window.VildaDobAge.readExactAge() || {}).days)).toBe(28);

  const pelneMies = await wzorzec(page, { plec: 'M', wiekMies: 0, pelneMies: 0, wzrost: 51, masa: 3.61, zrodlo: 'WHO' });
  const naDzis = await wzorzec(page, { plec: 'M', wiekMies: 28 / DNI_W_MIES, pelneMies: 0, wzrost: 51, masa: 3.61, zrodlo: 'WHO' });
  expect(pelneMies.ht).not.toBe(naDzis.ht);

  await otworzKarte(page, pid);
  expect(await centylKafelka(page, 'Wzrost'), 'pełne miesiące (wiersz 0. miesiąca)').toBe(pelneMies.ht);
  expect(await centylKafelka(page, 'Waga')).toBe(pelneMies.wt);
  const tekst = await schowek(page, pid);
  expect(centylSchowka(tekst, 'Wzrost'), tekst).toBe(pelneMies.ht);
});

test('karta porównania na siatce Palczewskiej (OLAF poniżej 3 lat): wzrost poprzedniego pomiaru w wieku z dnia pomiaru', async ({ page }) => {
  test.setTimeout(150_000);
  await otworzZKontem(page);
  // Chłopiec ur. 20 marca 2026: pomiar 27 maja (2 mies. 7 dni, 68. doba), dziś 17 czerwca (2 mies. 28 dni).
  const wiekPomiaru = 68 / DNI_W_MIES;
  const mediana = await page.evaluate((w) => window.VildaSdsWzrostu.policzNaSiatce({ wzrost: 60, plec: 'M', wiekMies: w, siatka: 'PALCZEWSKA' }).mediana, wiekPomiaru);
  const wzrost = Math.round(mediana * 10) / 10;
  const centyl = (wiekMies) => page.evaluate(({ h, w }) => Math.round(window.VildaSdsWzrostu.policzNaSiatce({ wzrost: h, plec: 'M', wiekMies: w, siatka: 'PALCZEWSKA' }).centyl), { h: wzrost, w: wiekMies });
  const wDniuPomiaru = await centyl(wiekPomiaru);
  const pelne = await centyl(2);
  expect(Math.abs(wDniuPomiaru - 50), 'wzrost dobrany na medianę dnia pomiaru (zaokrąglenie do 0,1 cm)').toBeLessThanOrEqual(1);
  expect(pelne, 'pełne miesiące dają inny centyl — test coś mierzy').not.toBe(wDniuPomiaru);

  const pid = await zalozPacjenta(page, {
    nazwisko: 'Probny', imie: 'Kacper', plec: 'M', dobISO: '2026-03-20', dataPomiaru: '2026-05-27',
    zapisISO: '2026-05-27T09:00:00.000Z', lata: 0, mies: 2, tygodnie: 9, wzrost, masa: 5.6, zrodlo: 'PALCZEWSKA',
  });
  await wczytajJakoNowyPomiar(page, pid);
  await expect(page.locator('#prevSummaryContent .porownanie-chip', { hasText: 'Palczewska' })).toHaveCount(1);
  await expect.poll(() => centylPoprzednio(page, 'wzrost'), { timeout: 15000 }).toBe(wDniuPomiaru);
});
