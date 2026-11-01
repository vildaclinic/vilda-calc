import { expect, test } from '../support/test-czas.mjs';
import { DNI_W_MIES, kartaGlownaPiateUrodziny, otworzZKontem, wpisz } from '../support/granica-urodzin.mjs';

// P-GRANICA-URODZIN (decyzja właściciela 2026-10-14): „siatkę wybierają pełne miesiące, wiek dokładny tylko
// interpoluje w jej obrębie"; granica 1. miesiąca (noworodek) zostaje według dób.
//
// Przed zmianą o siatce przesądzał wiek dokładny (doby / 30,4375). W dniu urodzin bywa on mniejszy niż pełne
// miesiące, bo lata bez 29 lutego są krótsze od 12 × 30,4375 doby. W dniu 3. urodzin po 1095 dobach wzrost
// szedł więc na siatkę Palczewskiej („brak danych OLAF poniżej 3 lat”), w dniu 5. urodzin nie działała
// bramka „otyłości olbrzymiej”, a karta zespołu Downa w dniu 2. urodzin brała tabelę niemowlęcą.
//
// Zegar: 17 czerwca 2026 (tests/support/czas.mjs), w dwóch testach przestawiony na 1 marca 2027.
// Dane FIKCYJNE.
test.use({ serviceWorkers: 'block' });

const HASLO = 'E2e#GranicaUrodzin!26';

// Zapis pomiaru tak, jak trzyma go sejf: wiek z chwili pomiaru, data pomiaru, źródło siatek.
const zalozPacjenta = (page, p) => page.evaluate(async (d) => {
  const w = await window.VildaVault.savePatient({
    name: `${d.nazwisko} ${d.imie}`, timestampISO: d.zapisISO, zscore: { dataSource: d.zrodlo },
    user: { lastName: d.nazwisko, firstName: d.imie, sex: d.plec, dobISO: d.dobISO, measuredAtISO: d.dataPomiaru,
      age: d.lata, ageMonths: d.mies, height: d.wzrost, weight: d.masa },
  }, { dedup: false });
  return w.patientId;
}, p);

const liczbaCentyla = (tekst) => {
  const m = /(\d+)\.? centyl/.exec(String(tekst || ''));
  return m ? Number(m[1]) : null;
};
const kafelek = (page, etykieta) => page.locator('.vilda-patient-stat')
  .filter({ has: page.locator('.vilda-patient-stat-label', { hasText: etykieta }) }).first();
const centylKafelka = async (page, etykieta) => liczbaCentyla(await kafelek(page, etykieta).innerText());
const centylPoprzednio = async (page, klucz) => liczbaCentyla(await page.locator(`#prevSummaryContent tr[data-klucz="${klucz}"] .pt-kol-poprzednio`).innerText());
const centylSchowka = (tekst, etykieta) => liczbaCentyla((String(tekst).split('\n').find((l) => l.startsWith(`${etykieta}:`)) || ''));

async function otworzKarte(page, pid) {
  await page.evaluate((id) => window.VildaAuthUI.showPatientCard(id, (r) => { if (r) window.applyLoadedData(r); }, null), pid);
  await expect(page.locator('.vilda-patient-stat-label', { hasText: 'Wzrost' }).first()).toBeVisible({ timeout: 20000 });
}

test('karta główna w dniu 5. urodzin (1826 dób): bramka „otyłości olbrzymiej” liczy pełne miesiące', async ({ page }) => {
  test.setTimeout(120_000);
  await otworzZKontem(page, HASLO);
  await kartaGlownaPiateUrodziny(page);
});

test('karta główna w dniu 3. urodzin (1095 dób): wzrost na siatce OLAF, nie na zastępczej Palczewskiej', async ({ page }) => {
  test.setTimeout(120_000);
  await otworzZKontem(page, HASLO);
  // 1 marca 2024 → 1 marca 2027: żadnego 29 lutego, więc 3 lata to 1095 dób = 35,975 mies.
  await page.clock.setSystemTime(new Date('2027-03-01T11:00:00Z'));
  await wpisz(page, { sex: 'M', weight: '14', height: '95' });
  await wpisz(page, { dobInput: '01-03-2024' });
  await expect.poll(() => page.evaluate(() => {
    const e = window.VildaDobAge.readExactAge();
    return e ? `${e.totalMonths}/${e.days}` : null;
  })).toBe('36/1095');

  const wzorzec = await page.evaluate((d) => {
    const T = window.VildaSdsWzrostu;
    const naDoby = T.policz({ wzrost: 95, plec: 'M', wiekMies: 1095 / d, zrodlo: 'OLAF' });
    const naPelne = T.policz({ wzrost: 95, plec: 'M', wiekMies: 36, zrodlo: 'OLAF' });
    return { naDoby: { siatka: naDoby.siatka, centyl: Math.round(naDoby.centyl) }, naPelne: { siatka: naPelne.siatka, centyl: Math.round(naPelne.centyl) } };
  }, DNI_W_MIES);
  expect(wzorzec.naDoby, 'wiek dokładny 35,975 mies. trafiał na siatkę zastępczą').toEqual({ siatka: 'PALCZEWSKA', centyl: 31 });
  expect(wzorzec.naPelne).toEqual({ siatka: 'OLAF', centyl: 25 });

  // Źródło siatek strona dobiera do wieku (poniżej 3 lat WHO, od 3 lat OLAF) — czekamy na stan po wpisaniu daty.
  await expect.poll(() => page.evaluate(() => {
    const r = window.calcPercentileStats(95, 'M', 3, 'HT');
    return r ? { siatka: r.siatka, fallback: r.fallback, centyl: Math.round(r.percentile) } : null;
  })).toEqual({ siatka: 'OLAF', fallback: false, centyl: 25 });
  await expect(page.locator('#whResult')).toContainText('Wzrost: 25 centyl', { timeout: 15000 });
});

test('zapisany pomiar z dnia 3. urodzin: kafelki Karty pacjenta, schowek i „Poprzednio” na OLAF', async ({ page }) => {
  test.setTimeout(150_000);
  await otworzZKontem(page, HASLO);
  // Chłopiec ur. 1 marca 2020, zmierzony 1 marca 2023 (3. urodziny, 1095 dób), dziś ma 6 lat.
  const pid = await zalozPacjenta(page, {
    nazwisko: 'Probny', imie: 'Trzylatek', plec: 'M', dobISO: '2020-03-01', dataPomiaru: '2023-03-01',
    zapisISO: '2023-03-01T09:00:00.000Z', lata: 3, mies: 0, wzrost: 95, masa: 14, zrodlo: 'OLAF',
  });
  const wzorzec = await page.evaluate((d) => {
    const bmi = 14 / 0.95 ** 2;
    const ht = (w) => window.VildaSdsWzrostu.policz({ wzrost: 95, plec: 'M', wiekMies: w, zrodlo: 'OLAF' });
    const bm = (w) => window.VildaBmi.ocen({ bmi, plec: 'M', wiekMies: w, zrodlo: 'OLAF' });
    return {
      ht: Math.round(ht(36).centyl), htDoby: Math.round(ht(1095 / d).centyl), htSiatka: ht(36).siatka,
      bmi: Math.round(bm(36).centyl), bmiDoby: Math.round(bm(1095 / d).centyl), bmiSiatkaDoby: bm(1095 / d).siatka,
    };
  }, DNI_W_MIES);
  expect(wzorzec.htSiatka).toBe('OLAF');
  expect(wzorzec.ht, 'wiek dokładny dawał inny centyl wzrostu — test mierzy granicę').not.toBe(wzorzec.htDoby);
  expect(wzorzec.bmiSiatkaDoby, 'BMI wieku dokładnego szło na Palczewską').toBe('PALCZEWSKA');
  expect(wzorzec.bmi).not.toBe(wzorzec.bmiDoby);

  await otworzKarte(page, pid);
  expect(await centylKafelka(page, 'Wzrost'), 'kafelek „Wzrost”').toBe(wzorzec.ht);
  expect(await centylKafelka(page, 'BMI'), 'kafelek „BMI”').toBe(wzorzec.bmi);

  const tekst = await page.evaluate(async (id) => {
    const p = await window.VildaVault.getPatient(id);
    return window.VildaPatientSummaryCopy.buildSummaryTextFromPayload(p.snapshots[0].payload, {});
  }, pid);
  expect(centylSchowka(tekst, 'Wzrost'), tekst).toBe(wzorzec.ht);
  expect(centylSchowka(tekst, 'BMI'), tekst).toBe(wzorzec.bmi);

  await expect.poll(() => page.evaluate(() => window.VildaSaveStatusIndicator.getCurrentDecision().ready)).toBe(true);
  await page.getByRole('button', { name: 'Wczytaj tego pacjenta' }).click();
  await page.waitForSelector('#vildaLoadChoiceModal', { state: 'visible', timeout: 8000 });
  await page.click('#vildaLcmNew');
  await page.waitForSelector('#vildaLoadChoiceModal', { state: 'detached', timeout: 8000 }).catch(() => {});
  await expect(page.locator('#prevSummaryWrap')).toBeVisible({ timeout: 20000 });
  await expect.poll(() => centylPoprzednio(page, 'wzrost'), { timeout: 15000 }).toBe(wzorzec.ht);
  expect(await centylPoprzednio(page, 'bmi'), 'BMI „Poprzednio”').toBe(wzorzec.bmi);
});

test('karta zespołu Downa w dniu 2. urodzin (730 dób): BMI DS zamiast masy do długości', async ({ page }) => {
  test.setTimeout(120_000);
  await otworzZKontem(page, HASLO);
  // Chłopiec ur. 17 czerwca 2024, dziś 2. urodziny: 730 dób = 23,98 mies. przy 24 pełnych miesiącach.
  await wpisz(page, { sex: 'M', weight: '12', height: '84' });
  await wpisz(page, { dobInput: '17-06-2024' });
  await expect.poll(() => page.evaluate(() => {
    const e = window.VildaDobAge.readExactAge();
    return e ? `${e.totalMonths}/${e.days}` : null;
  })).toBe('24/730');
  expect(await page.evaluate(() => window.VildaDobAge.readExactAge().exactMonths / 12), 'wiek dokładny < 2 lat — karta brała tabelę niemowlęcą').toBeLessThan(2);
  expect(await page.evaluate(() => window.__ds_readAgeYears())).toBe(2);

  await expect(page.locator('#toggleDownSyndrome')).toBeVisible({ timeout: 15000 });
  await page.locator('#toggleDownSyndrome').click();
  const box = page.locator('#dsPercentiles');
  await expect(box).toContainText('Wzrost:', { timeout: 15000 });
  const bmiDs = await page.evaluate(() => Math.round(window.VildaBmi.policz({ bmi: 12 / 0.84 ** 2, plec: 'M', wiekMies: 24, zrodlo: 'OLAF', populacja: 'DS' }).centyl));
  const wierszBmi = await box.evaluate((el) => {
    const w = Array.from(el.querySelectorAll('div')).find((d) => /^BMI:/.test(d.textContent.trim()));
    return w ? w.textContent.trim() : null;
  });
  expect(wierszBmi, 'wiersz BMI DS z centylem').toMatch(new RegExp(`${bmiDs}\\. centyl|${bmiDs} centyl`));
  await expect(box).not.toContainText('Normy BMI DS obowiązują od 2. r.ż.');
  await expect(box).not.toContainText('Masa do długości (WFL DS)');
});

test('noworodek nadal według dób (decyzja właściciela): 28. doba urodzonego 1 lutego → WHO 2006', async ({ page }) => {
  test.setTimeout(120_000);
  await otworzZKontem(page, HASLO);
  // 1 lutego → 1 marca 2027: 1 pełny miesiąc, ale dopiero 28. doba (0,92 mies.). Siatka Palczewskiej zaczyna
  // się od 1. miesiąca, a o noworodku przesądzają doby — wzrost idzie na WHO 2006, jak przed zmianą.
  await page.clock.setSystemTime(new Date('2027-03-01T11:00:00Z'));
  await wpisz(page, { sex: 'M', weight: '4.3', height: '54' });
  await wpisz(page, { dobInput: '01-02-2027' });
  await expect.poll(() => page.evaluate(() => {
    const e = window.VildaDobAge.readExactAge();
    return e ? `${e.totalMonths}/${e.days}` : null;
  })).toBe('1/28');
  // Bramka formularza nie przycina 28. doby do 1. miesiąca: 1 nie jest granicą w GRANICE.
  const wiek = await page.evaluate(() => window.lmsNiemowleWiek(1));
  expect(wiek).toBeCloseTo(28 / DNI_W_MIES, 9);
  // Źródło podane jawnie: poniżej 3 lat strona sama przełącza siatki na WHO (getDefaultGrowthDataSource poza
  // trybem PRO), a tu sprawdzamy regułę przy OLAF — noworodek idzie na WHO 2006 z jawnym powodem.
  const r = await page.evaluate((w) => {
    const x = window.VildaSdsWzrostu.policz({ wzrost: 54, plec: 'M', wiekMies: w, zrodlo: 'OLAF' });
    return { siatka: x.siatka, fallback: x.fallback, powod: x.powod };
  }, wiek);
  expect([r.siatka, r.fallback]).toEqual(['WHO', true]);
  expect(r.powod).toContain('noworodek poniżej 1. miesiąca');
  // Rdzeń karty głównej przy dowolnym źródle strony daje tę samą siatkę WHO 2006.
  expect(await page.evaluate(() => window.calcPercentileStats(54, 'M', 1 / 12, 'HT').siatka)).toBe('WHO');
});
