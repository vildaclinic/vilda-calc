import { expect, test } from '../support/test-czas.mjs';

// P-BMI-1 (decyzje właściciela 2026-09-16) — na PRAWDZIWEJ stronie index.html:
//   • dwulatek: karta główna i rdzeń (bmiPercentileChild) dają JEDNĄ liczbę (przełącznik siatek
//     nie dopuszcza OLAF poniżej 3 lat, więc karta jest na WHO); przy zadanym OLAF (historia,
//     raport zaawansowany) silnik idzie na Palczewską z jawnym powodem — przed etapem 1 rdzeń
//     szedł tu po cichu na WHO, a karta na Palczewską (62 c vs 77 c w audycie);
//   • „Otyłość olbrzymia" (SDS ≥ 3) poniżej 5 lat nie pada w tekście karty (bramka 60 mies. działa
//     na karcie, nie tylko w bmiCategoryChild);
//   • od 18 lat karta klasyfikuje progami dorosłych, 17-latek nadal centylem;
//   • przy Palczewskiej Cole (historia, silnik) i calcPercentileStatsPal liczą z p50 Palczewskiej.
// Dane wyłącznie FIKCYJNE.
test.use({ serviceWorkers: 'block' });

async function openIndex(page) {
  await page.addInitScript(() => {
    try {
      window.localStorage.setItem('vilda-terms-accepted-v1',
        JSON.stringify({ version: 1, acceptedAtISO: new Date().toISOString() }));
    } catch (_) { /* brak storage — pomiń */ }
  });
  await page.goto('/index.html', { waitUntil: 'load' });
  await page.waitForFunction(() => typeof window.update === 'function' && Boolean(window.VildaBmi)
    && typeof window.bmiPercentileChild === 'function' && typeof window.advHistoryResolveMetric === 'function');
  await page.waitForTimeout(800);
}

/* Wpisuje pacjenta jak lekarz i przelicza kartę. */
async function pacjent(page, { age, months, sex, weight, height, zrodlo }) {
  return page.evaluate(({ age: a, months: m, sex: s, weight: w, height: h, zrodlo: z }) => {
    const set = (id, v) => { const el = document.getElementById(id); el.value = String(v); el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); };
    set('age', a); set('ageMonths', m); set('sex', s); set('weight', w); set('height', h);
    if (z) {
      /* Radio źródła bywa ukryte albo wyłączone — ustawiamy je tak, jak robi to aplikacja
         (zaznaczenie + change, na które app.js przepina bmiSource), jak w sds-wzrostu-rdzen. */
      const id = { OLAF: 'sourceOlaf', WHO: 'sourceWho', PALCZEWSKA: 'sourcePalczewska' }[z];
      const r = document.getElementById(id);
      r.disabled = false; r.checked = true; r.dispatchEvent(new Event('change', { bubbles: true }));
    }
    window.update();
    const karta = document.getElementById('bmiResult') || document.getElementById('bmrInfo');
    const zazn = document.querySelector('input[name="dataSource"]:checked');
    return { tekst: karta ? karta.textContent : '', centylKarty: window.bmiPercentileValue, kategoria: window.lastBmiCategory, zrodlo: zazn ? zazn.value : null, cole: window.colePercentValue };
  }, { age, months, sex, weight, height, zrodlo });
}

test('dwulatek: karta i rdzeń jedną liczbą (WHO wymuszone przez przełącznik), historia przy OLAF z Palczewskiej z powodem; „olbrzymia" poniżej 5 lat nie pada na karcie', async ({ page }) => {
  test.setTimeout(120_000);
  await openIndex(page);
  // 2 lata 0 mies., chłopiec, 13,6 kg / 89,4 cm → BMI 17,0. Przełącznik siatek nie dopuszcza OLAF
  // poniżej 3 lat (isGrowthDataSourceAllowed) — karta przechodzi na WHO 2006.
  const k = await pacjent(page, { age: 2, months: 0, sex: 'M', weight: 13.6, height: 89.4, zrodlo: 'OLAF' });
  expect(k.zrodlo, 'UI wymusza WHO poniżej 3 lat').toBe('WHO');
  const r = await page.evaluate(() => {
    const bmi = 13.6 / Math.pow(0.894, 2);
    const who = window.VildaBmi.policz({ bmi, plec: 'M', wiekMies: 24, zrodlo: 'WHO' });
    const olaf = window.VildaBmi.policz({ bmi, plec: 'M', wiekMies: 24, zrodlo: 'OLAF' });
    const historia = window.advHistoryResolveMetric('BMI', bmi, 'M', 2, 'OLAF');
    return {
      who: { centyl: who.centyl, siatka: who.siatka, fallback: who.fallback },
      olaf: { centyl: olaf.centyl, siatka: olaf.siatka, fallback: olaf.fallback, powod: olaf.powod },
      rdzen: window.bmiPercentileChild(bmi, 'M', 24),
      historia: historia && historia.result ? { centyl: historia.result.percentile, siatka: historia.source, powod: historia.reason } : null,
    };
  });
  expect(r.who.siatka).toBe('WHO');
  expect(k.centylKarty, 'karta główna = silnik (WHO)').toBeCloseTo(r.who.centyl, 6);
  expect(r.rdzen, 'rdzeń = karta').toBeCloseTo(r.who.centyl, 6);
  expect(k.tekst).toContain(`${Math.round(r.who.centyl)} centyl`);
  // Decyzja 1: przy zadanym OLAF poniżej 3 lat — Palczewska z jawnym powodem, nie ciche WHO.
  expect(r.olaf.siatka).toBe('PALCZEWSKA');
  expect(r.olaf.fallback).toBe(true);
  expect(r.olaf.powod).toBe('brak danych OLAF dla wieku poniżej 3 lat');
  expect(r.historia.siatka).toBe('PALCZEWSKA');
  expect(r.historia.centyl, 'historia (raport zaawansowany) = silnik').toBeCloseTo(r.olaf.centyl, 6);
  expect(Math.abs(r.olaf.centyl - r.who.centyl), 'to były dwie różne liczby z audytu (62 c vs 77 c)').toBeGreaterThan(10);

  // Skrajnie wysokie BMI u 3,5-latki (OLAF dozwolone od 3 lat): SDS ≥ 3, ale „olbrzymia" dopiero od 60 mies.
  const o = await pacjent(page, { age: 3, months: 6, sex: 'F', weight: 26, height: 96, zrodlo: 'OLAF' });
  expect(o.zrodlo).toBe('OLAF');
  const sds = await page.evaluate(() => window.bmiZscore(26 / Math.pow(0.96, 2), 'F', 42));
  expect(sds).toBeGreaterThanOrEqual(3);
  expect(o.kategoria).toBe('Otyłość');
  expect(o.tekst).not.toContain('olbrzymia');
  // ta sama sytuacja w wieku 6 lat już jest „olbrzymia"
  const o6 = await pacjent(page, { age: 6, months: 0, sex: 'F', weight: 42, height: 115, zrodlo: 'OLAF' });
  const sds6 = await page.evaluate(() => window.bmiZscore(42 / Math.pow(1.15, 2), 'F', 72));
  expect(sds6).toBeGreaterThanOrEqual(3);
  expect(o6.kategoria).toBe('Otyłość olbrzymia');
  expect(o6.tekst).toContain('olbrzymia');
});

test('granica dorosłości 18 lat na karcie; Cole i mediana przy Palczewskiej z p50 Palczewskiej (funkcje produkcyjne)', async ({ page }) => {
  test.setTimeout(120_000);
  await openIndex(page);
  const teen = await pacjent(page, { age: 17, months: 11, sex: 'M', weight: 57.7, height: 178, zrodlo: 'OLAF' });
  expect(teen.kategoria, '17 lat 11 mies.: kategoria z centyla').not.toBe('Niedowaga');
  expect(typeof teen.centylKarty).toBe('number');
  const adult = await pacjent(page, { age: 18, months: 0, sex: 'M', weight: 57.7, height: 178, zrodlo: 'OLAF' });
  expect(adult.kategoria, '18 lat: BMI 18,2 < 18,5 → dorosła niedowaga').toBe('Niedowaga');
  expect(adult.centylKarty).toBeNull();

  const r = await page.evaluate(() => {
    const bmi = 33.3 / Math.pow(1.4, 2);
    const p50 = window.getPalReferenceCentileInterpolated('M', 120, 50, 'BMI');
    return {
      oczekiwany: bmi / p50 * 100,
      historia: window.advHistoryCalcColeForSource(bmi, 'M', 10, 'PALCZEWSKA'),
      silnik: window.VildaBmi.cole({ bmi, plec: 'M', wiekMies: 120, zrodlo: 'PALCZEWSKA' }),
      palBmiStats: window.calcPercentileStatsPal(bmi, 'M', 10, 'BMI'),
      silnikPal: window.VildaBmi.policzNaSiatce({ bmi, plec: 'M', wiekMies: 120, siatka: 'PALCZEWSKA' }),
    };
  });
  expect(r.silnik.siatka).toBe('PALCZEWSKA');
  expect(r.historia, 'Cole w historii z p50 Palczewskiej').toBeCloseTo(r.oczekiwany, 6);
  expect(r.silnik.cole).toBeCloseTo(r.oczekiwany, 6);
  expect(r.palBmiStats.sd, 'calcPercentileStatsPal BMI = silnik').toBeCloseTo(r.silnikPal.sds, 9);
  expect(r.palBmiStats.median).toBeCloseTo(r.silnikPal.mediana, 9);
});
