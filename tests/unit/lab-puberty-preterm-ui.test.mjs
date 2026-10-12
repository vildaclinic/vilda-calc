import { describe, expect, it } from 'vitest';
import { loadBrowserScript } from '../support/load-browser-script.mjs';

const browser = {};
loadBrowserScript('vilda_lab_puberty_ui.js', browser);
const ui = browser.VildaLabPubertyUI;
const measurement = { analyte: 'lh', raw: '2', unit: 'IU/L' };

describe('Wcześniak — minimalny formularz wieku', () => {
  it.each([
    ['28+4', 200, 200], ['24+0', 168, 168], ['32+0', 224, 224],
    ['28', 196, 202], ['32', 224, 230], [' 28 + 4 ', 200, 200],
  ])('zapis %s zachowuje ukończone tygodnie i faktyczną precyzję dni', (value, lower, upper) => {
    expect(ui.parseGestationalAge(value)).toEqual({ lower, upper, source: 'manual-gestational-age' });
  });

  it.each(['28+7', '28.4', '28,4', '28+', '-28', '28+04', 'abc'])('nie interpretuje niejednoznacznego wieku %s jako dokładnego', (value) => {
    expect(ui.parseGestationalAge(value)).toEqual({ lower: null, upper: null, source: 'manual-gestational-age' });
  });

  it('puste pole pozostaje brakiem danych, a nie zerowym wiekiem', () => {
    expect(ui.parseGestationalAge('')).toBeNull();
    expect(ui.parsePostnatalDays('')).toBeNull();
  });

  it.each([['0', 0], ['1', 1], ['43', 43], [' 43 ', 43]])('zachowuje podaną liczbę ukończonych dni %s', (value, days) => {
    expect(ui.parsePostnatalDays(value)).toEqual({ lower: days, upper: days, source: 'manual-completed-days' });
  });

  it.each(['-1', '1.5', '1,5', '2e1', '43 dni', 'Infinity', '9007199254740992'])('nie zaokrągla nieprawidłowego wieku po urodzeniu %s', (value) => {
    expect(ui.parsePostnatalDays(value)).toEqual({ lower: null, upper: null, source: 'manual-completed-days' });
  });

  it('przenosi przedział z dat bez wytwarzania dokładnej liczby dni ani kopiowania DOB', () => {
    const neonatalAge = {
      postnatalDays: { lower: 42, upper: 43, source: 'main-calendar-dates', birthDateISO: '2026-08-27' },
      gestationalDays: { lower: 200, upper: 200, source: 'patient-record', patientId: 'fictional-secret' },
      birthDateISO: '2026-08-27',
    };
    const input = ui.buildInput({ contextBasis: 'current-patient', ageYears: '0', ageMonths: '1',
      preterm: 'yes', neonatalAge, useNeonatalAge: true, birthDate: '2026-08-27' }, measurement);
    expect(input.neonatalAge).toEqual({
      postnatalDays: { lower: 42, upper: 43, source: 'main-calendar-dates' },
      gestationalDays: { lower: 200, upper: 200, source: 'patient-record' },
    });
    expect(input.age).toBeNull();
    expect(input.birthDateISO).toBeNull();
    expect(input.sampleDateISO).toBeNull();
    expect(JSON.stringify(input)).not.toContain('fictional-secret');
    expect(JSON.stringify(input)).not.toContain('2026-08-27');
    neonatalAge.postnatalDays.lower = 0;
    expect(input.neonatalAge.postnatalDays.lower).toBe(42);
  });

  it('ręczne doprecyzowanie nie potwierdza metody, leczenia ani badania bazalnego', () => {
    const input = ui.buildInput({ contextBasis: 'current-patient', preterm: 'yes', useNeonatalAge: true,
      neonatalAge: { gestationalDays: ui.parseGestationalAge('28+4'), postnatalDays: ui.parsePostnatalDays('43') } }, measurement);
    expect(input.neonatalAge.postnatalDays).toEqual({ lower: 43, upper: 43, source: 'manual-completed-days' });
    expect(input.measurementKind).toBe('unknown');
    expect(input.treatment).toEqual({ gnrha: 'unknown', sexSteroids: 'unknown', context: 'unknown' });
    expect(input.assay.confirmation).toBe('unknown');
  });

  it('brak danych noworodkowych zachowuje starszy kształt wejścia', () => {
    const input = ui.buildInput({ ageYears: '6', ageMonths: '0', sex: 'M', kind: 'G', stage: '3', preterm: 'yes' }, measurement);
    expect(input).not.toHaveProperty('neonatalAge');
    expect(input.age).toMatchObject({ years: 6, months: 0, precision: 'month' });
    expect(input.puberty).toMatchObject({ kind: 'G', stage: 3 });
  });

  it('sama obecność danych neonatalAge nie nadpisuje jawnego wieku starszego dziecka', () => {
    const input = ui.buildInput({ ageYears: '6', ageMonths: '0', preterm: 'yes', neonatalAge: {
      gestationalDays: { lower: 200, upper: 200, source: 'patient-record' }, postnatalDays: null,
    } }, measurement);
    expect(input.age).toMatchObject({ years: 6, months: 0 });
    expect(input.neonatalAge.postnatalDays).toBeNull();
  });

  it('nie usuwa zapisanej obserwacji rozwoju przy ukryciu selektora noworodkowego', () => {
    const input = ui.buildInput({ contextBasis: 'current-patient', sex: 'M', kind: 'G', stage: '3', preterm: 'yes',
      useNeonatalAge: true, neonatalAge: { gestationalDays: ui.parseGestationalAge('28+4'), postnatalDays: ui.parsePostnatalDays('43') } }, measurement);
    expect(input.puberty).toMatchObject({ kind: 'G', stage: 3, appliesToCurrentContext: true });
  });
});
