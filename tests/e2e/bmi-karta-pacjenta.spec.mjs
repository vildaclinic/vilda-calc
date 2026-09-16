import { expect, test } from '../support/test-czas.mjs';

// P-BMI-3 — Karta pacjenta na PRAWDZIWEJ stronie: kafelek BMI mówi liczbą silnika (ten sam
// centyl, co karta główna i schowek), z jednostką „kg/m²", a kolor kafelka idzie z kategorii
// silnika (niedowaga 3–5 c → „improve", dotąd bez koloru; < 3 c → „alert"); kafelek Cole’a
// z tej samej mediany. Dane wyłącznie FIKCYJNE; sejf zakładany na potrzeby testu.
test.use({ serviceWorkers: 'block' });

const HASLO = 'E2e#BmiKarta!26a';

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
  await page.waitForFunction(() => Boolean(window.VildaAuthUI) && Boolean(window.VildaBmi) && typeof window.bmiPercentileChild === 'function');
}

async function zalozPacjenta(page, { imie, sex, lata, mies, weight, height }) {
  return page.evaluate(async (d) => {
    const wynik = await window.VildaVault.savePatient({
      name: `Testowy ${d.imie}`,
      user: { lastName: 'Testowy', firstName: d.imie, sex: d.sex, age: d.lata, ageMonths: d.mies, height: d.height, weight: d.weight },
    }, { dedup: false });
    return wynik.patientId;
  }, { imie, sex, lata, mies, weight, height });
}

async function kafelki(page, patientId) {
  await page.evaluate((id) => window.VildaAuthUI.showPatientCard(id), patientId);
  await expect(page.locator('.vilda-patient-stat-label', { hasText: 'BMI' })).toBeVisible();
  return page.evaluate(() => {
    const czytaj = (label) => {
      const el = [...document.querySelectorAll('.vilda-patient-stat')].find((x) => (x.querySelector('.vilda-patient-stat-label') || {}).textContent === label);
      if (!el) return null;
      const sub = el.querySelector('.vilda-patient-stat-extra, .vilda-patient-stat-sub');
      return { klasa: el.className, wartosc: el.querySelector('.vilda-patient-stat-value').textContent, pod: sub ? sub.textContent : '' };
    };
    const zazn = document.querySelector('input[name="dataSource"]:checked');
    return { bmi: czytaj('BMI'), cole: czytaj('Wskaźnik Cole’a') || czytaj("Wskaźnik Cole'a"), zrodlo: zazn ? String(zazn.value).toUpperCase() : (window.bmiSource || 'OLAF') };
  });
}

const silnik = (page, { bmi, sex, mies, zrodlo }) => page.evaluate((d) => {
  const o = window.VildaBmi.ocen({ bmi: d.bmi, plec: d.sex, wiekMies: d.mies, zrodlo: d.zrodlo });
  const c = window.VildaBmi.cole({ bmi: d.bmi, plec: d.sex, wiekMies: d.mies, zrodlo: d.zrodlo });
  return { centyl: o.centyl, siatka: o.siatka, kolor: o.kategoria.kolor, etykieta: o.kategoria.etykieta, cole: c ? c.cole : null, rdzen: window.bmiPercentileChild(d.bmi, d.sex, d.mies) };
}, { bmi, sex, mies, zrodlo });

test('dwulatek: kafelek BMI = silnik = rdzeń (Palczewska przy OLAF), „kg/m²", Cole z tej samej mediany', async ({ page }) => {
  test.setTimeout(120_000);
  await otworzZKontem(page);
  const id = await zalozPacjenta(page, { imie: 'Dwulatek', sex: 'M', lata: 2, mies: 0, weight: 13.6, height: 89.4 });
  const k = await kafelki(page, id);
  const bmi = 13.6 / Math.pow(0.894, 2);
  const s = await silnik(page, { bmi, sex: 'M', mies: 24, zrodlo: k.zrodlo });
  expect(k.bmi.wartosc).toBe('17,0 kg/m²');
  expect(k.bmi.pod, 'centyl kafelka = centyl silnika dla źródła przełącznika').toBe(`${Math.round(s.centyl)}. centyl`);
  expect(s.rdzen, 'rdzeń (bmiPercentileChild) = silnik').toBeCloseTo(s.centyl, 6);
  if (k.zrodlo === 'OLAF') expect(s.siatka, 'decyzja 1: poniżej 3 lat przy OLAF — Palczewska').toBe('PALCZEWSKA');
  expect(k.cole, 'kafelek Cole’a obecny').not.toBeNull();
  expect(k.cole.wartosc).toBe(`${s.cole.toFixed(1).replace('.', ',')}%`);
});

test('kolor kafelka BMI z kategorii silnika: 4. centyl → improve (dotąd bez koloru), 2. centyl → alert, 90. centyl → improve', async ({ page }) => {
  test.setTimeout(120_000);
  await otworzZKontem(page);
  const h = 133;
  const wagi = await page.evaluate((hh) => {
    const m = hh / 100;
    const w = (c) => Math.round(window.VildaBmi.wartoscDlaCentyla({ centyl: c, plec: 'F', wiekMies: 108, zrodlo: 'OLAF' }).bmi * m * m * 10) / 10;
    return { w4: w(4), w2: w(2), w90: w(90) };
  }, h);
  for (const [nazwa, waga, oczekiwana, etykieta] of [['Czwarty', wagi.w4, 'improve', 'Niedowaga'], ['Drugi', wagi.w2, 'alert', 'Niedowaga'], ['Dziewiecdziesiaty', wagi.w90, 'improve', 'Nadwaga']]) {
    const id = await zalozPacjenta(page, { imie: nazwa, sex: 'F', lata: 9, mies: 0, weight: waga, height: h });
    const k = await kafelki(page, id);
    const s = await silnik(page, { bmi: waga / Math.pow(h / 100, 2), sex: 'F', mies: 108, zrodlo: k.zrodlo });
    expect(s.etykieta, nazwa).toBe(etykieta);
    expect(k.bmi.klasa, `${nazwa}: kolor kafelka`).toContain(`vilda-patient-stat--${oczekiwana}`);
    expect(k.bmi.pod).toBe(`${Math.round(s.centyl)}. centyl`);
  }
});
