import { expect } from '@playwright/test';

// P-GRANICA-URODZIN (decyzja właściciela 2026-10-14): wspólne kroki testów e2e na komputerze i telefonie.
//
// Wiek dokładny (doby / 30,4375) i pełne miesiące kalendarzowe rozjeżdżają się przy urodzinach. Siatkę
// i bramki kategorii wybierają teraz pełne miesiące, a wiek dokładny tylko interpoluje w ich obrębie
// (vildaWiekDoSiatek w app.js). Testy wpisują datę urodzenia przypadającą dokładnie na urodziny
// i sprawdzają, co widzi lekarz. Wartości oczekiwane liczą wprost silniki strony (VildaBmi,
// VildaSdsWzrostu), a kontrola w każdym teście pokazuje, że wiek dokładny dałby inny wynik.
// Dane FIKCYJNE. Sejf testowy zakłada się w świeżym kontekście przeglądarki, jak w innych testach e2e.

export const DNI_W_MIES = 30.4375;

export async function otworzZKontem(page, haslo) {
  await page.addInitScript(() => {
    try {
      window.localStorage.setItem('vilda-terms-accepted-v1', JSON.stringify({ version: 1, acceptedAtISO: new Date().toISOString() }));
    } catch (_) { /* brak storage — pomiń */ }
  });
  await page.goto('/index.html', { waitUntil: 'load' });
  await page.waitForFunction(() => Boolean(window.VildaVault));
  await page.evaluate(async (pw) => window.VildaVault.createUser(pw, { label: 'e2e', iterations: 10000 }), haslo);
  await page.reload({ waitUntil: 'load' });
  await page.waitForFunction(() => Boolean(window.VildaVault) && window.VildaVault.isUnlocked()
    && !document.documentElement.classList.contains('vilda-auth-locked')
    && Boolean(window.VildaDobAge) && Boolean(window.VildaBmi) && Boolean(window.VildaSdsWzrostu)
    && typeof window.calcPercentileStats === 'function', null, { timeout: 30000 });
}

export const wpisz = (page, pola) => page.evaluate((p) => {
  for (const [id, v] of Object.entries(p)) {
    const el = document.getElementById(id);
    if (!el) throw new Error('brak pola ' + id);
    el.value = String(v);
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }
}, pola);

// Dziewczynka ur. 17 czerwca 2021, dziś (zegar testów: 17 czerwca 2026) 5. urodziny: 1826 dób = 59,99 mies.
// przy 60 pełnych miesiącach. Wzrost 110 cm, masa 31,46 kg → BMI 26,0 (BMI-SDS na OLAF ok. +3,14).
export const PIECIOLATKA = { sex: 'F', weight: '31.46', height: '110', dobInput: '17-06-2021' };

// Karta główna w dniu 5. urodzin: kategoria BMI i ostrzeżenie. Zwraca kontrolę z silnika dla wieku dokładnego.
export async function kartaGlownaPiateUrodziny(page) {
  await wpisz(page, { sex: PIECIOLATKA.sex, weight: PIECIOLATKA.weight, height: PIECIOLATKA.height });
  await wpisz(page, { dobInput: PIECIOLATKA.dobInput });
  await expect.poll(() => page.evaluate(() => {
    const e = window.VildaDobAge.readExactAge();
    return e ? `${e.totalMonths}/${e.days}` : null;
  }), { message: 'formularz: 60 pełnych miesięcy i 1826. doba' }).toBe('60/1826');
  const kontrola = await page.evaluate((d) => {
    const bmi = 31.46 / 1.1 ** 2;
    const naDoby = window.VildaBmi.ocen({ bmi, plec: 'F', wiekMies: 1826 / d, zrodlo: 'OLAF' });
    const naPelne = window.VildaBmi.ocen({ bmi, plec: 'F', wiekMies: 60, zrodlo: 'OLAF' });
    return { sds: naPelne.sds, naDoby: naDoby.kategoria.etykieta, naPelne: naPelne.kategoria.etykieta };
  }, DNI_W_MIES);
  expect(kontrola.sds, 'BMI-SDS ≥ 3 — próg „otyłości olbrzymiej”').toBeGreaterThanOrEqual(3);
  expect(kontrola.naDoby, 'wiek dokładny 59,99 mies. nie przechodzi bramki 60 mies. — test mierzy granicę').toBe('Otyłość');
  expect(kontrola.naPelne).toBe('Otyłość olbrzymia');
  const wynik = page.locator('#bmiResult');
  await expect(wynik).toContainText('BMI: 26,0', { timeout: 15000 });
  await expect(wynik).toContainText('(Otyłość olbrzymia)');
  await expect(wynik).toContainText('Otyłość olbrzymia wg BMI');
  return kontrola;
}
