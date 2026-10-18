import { describe, expect, it } from 'vitest';
import { funkcjaZ, zrodlo } from '../support/silnik-bmi.mjs';

// P-DYMEK-ZAKRESU (decyzja właściciela 2026-10-17): dymek „poza zakresem” nie miga przy pisaniu.
// Dopóki pole ma fokus, dymek czeka, jeśli dopisanie cyfr może jeszcze dać wartość z zakresu.
// Funkcje wycięte z pliku produkcyjnego vilda_update_prep.js; dane fikcyjne.

const PREP = zrodlo('vilda_update_prep.js');
const { zakres, mozeJeszcze, waliduj } = new Function([
  funkcjaZ(PREP, 'vildaUpdatePrepZakresPola'),
  funkcjaZ(PREP, 'vildaUpdatePrepMozeJeszczeWZakresie'),
  funkcjaZ(PREP, 'vildaUpdatePrepValidateMainInputs'),
  'return { zakres: vildaUpdatePrepZakresPola, mozeJeszcze: vildaUpdatePrepMozeJeszczeWZakresie, waliduj: vildaUpdatePrepValidateMainInputs };',
].join('\n'))();

const WAZNE = { age: 9, weight: 40, height: 135 };
const bladPola = (pole, wartosc) => waliduj({ values: { ...WAZNE, [pole]: wartosc } }).rangeErrorsByField[pole];

describe('granice dymka = progi walidacji', () => {
  // Gdyby ktoś zmienił próg w walidacji, a nie w granicach dymka, dymek czekałby na wartości,
  // których nie da się już naprawić (albo pokazywał się za wcześnie). Strażnik spina oba miejsca.
  for (const pole of ['age', 'weight', 'height']) {
    it(`${pole}: [${zakres(pole)}] jak w vildaUpdatePrepValidateMainInputs`, () => {
      const [min, max] = zakres(pole);
      expect(bladPola(pole, min)).toBe(false);
      expect(bladPola(pole, max)).toBe(false);
      expect(bladPola(pole, max + 0.1)).toBe(true);
      if (min > 0) expect(bladPola(pole, min - 0.1)).toBe(true);
    });
  }

  it('pole spoza listy nie ma granic', () => {
    expect(zakres('ageMonths')).toBe(null);
    expect(zakres('')).toBe(null);
  });
});

describe('czy dopisanie cyfr może jeszcze dać wartość z zakresu', () => {
  const [hMin, hMax] = [40, 250];

  it('wzrost: początki prawdziwych wartości czekają', () => {
    // 135 → „1”, „13”; 45 → „4”; 205 → „2”, „20”
    for (const s of ['1', '13', '4', '2', '20', '9']) expect(mozeJeszcze(s, hMin, hMax), s).toBe(true);
  });

  it('wzrost: wartości, których dopisanie nie naprawi, pokazują dymek od razu', () => {
    // „3” → 30–39 i 300+ poza zakresem; „39” → 390+; „260” rośnie dalej
    for (const s of ['3', '39', '26', '260', '1000']) expect(mozeJeszcze(s, hMin, hMax), s).toBe(false);
  });

  it('część dziesiętna to koniec liczby — dopisanie cyfr zmienia ją o mniej niż jedność', () => {
    expect(mozeJeszcze('13.5', hMin, hMax)).toBe(false);
    expect(mozeJeszcze('0.5', 1, 500)).toBe(false);
    expect(mozeJeszcze('39.9', hMin, hMax)).toBe(false);
  });

  it('waga i wiek', () => {
    expect(mozeJeszcze('0', 1, 500)).toBe(true);
    expect(mozeJeszcze('600', 1, 500)).toBe(false);
    expect(mozeJeszcze('200', 0, 130)).toBe(false);
  });

  it('puste, ujemne i nieliczbowe nie czekają', () => {
    for (const s of ['', '-5', '1e2', 'abc', null, undefined]) expect(mozeJeszcze(s, hMin, hMax), String(s)).toBe(false);
  });
});
