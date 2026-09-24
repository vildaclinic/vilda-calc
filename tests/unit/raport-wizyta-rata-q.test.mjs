import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

// P-RAPORT rata Q (decyzje właściciela 2026-09-22): „Raport po wizycie”.
// Test woła PRAWDZIWE funkcje z vilda_patient_report.js (eksportowane na window), nie kopie wzorów.
// Fixture `dane` to dosłowny kształt `dane` z generatora zaleceń (vildaDaneZalecen) dla FIKCYJNYCH
// pacjentów: dziewczynka 9 lat 52,6 kg / 146,2 cm (otyłość), mężczyzna 47 lat 112 kg / 167 cm (BMI 40),
// chłopiec 9 lat 29 kg / 134 cm (norma). Pełna ścieżka (generator → karta → PDF) jest w e2e.

const korzen = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const ZRODLO = fs.readFileSync(path.join(korzen, 'vilda_patient_report.js'), 'utf8');

function okno() {
  const w = {};
  const doc = { getElementById: () => null, querySelector: () => null, addEventListener() {}, documentElement: { classList: { add() {}, remove() {} } } };
  w.window = w; w.document = doc; w.globalThis = w;
  globalThis.ADULT_BMI = globalThis.ADULT_BMI || { UNDER: 18.5, OVER: 25, OBESE: 30 };
  new Function('window', 'document', 'globalThis', ZRODLO)(w, doc, w);
  return w;
}
const w = okno();

const DANE_DZIECKO_OTYLOSC = {
  wersja: 1, dorosly: false, strategia: 'stabilization',
  klasyfikacja: { nadmiar: true, nadwaga: true, otylosc: true, niedowaga: false },
  energia: { reeKcal: 1492.36, teeBazowyKcal: 2089.304, palUzyty: 1.4, podazKcal: 1754, podazZaokrKcal: 1800, deficytKcal: 126, dietaKlucz: 'light', dietaNazwa: 'lekka', utrzymanieKcal: 1880, nadwyzkaKcal: null, podazZakresKcal: null },
  masa: { docelowaKg: 41.755, doRedukcjiKg: 10.84, gornaNormaKg: 41.755, dolnaNormaKg: null, pierwszyCel: null },
};
const DANE_DOROSLY_NORMA = {
  wersja: 1, dorosly: true, strategia: 'utrzymanie',
  klasyfikacja: { klucz: 'normal', nadmiar: false, nadwaga: false, otylosc: false, niedowaga: false },
  energia: { reeKcal: null, teeBazowyKcal: 1881.5, palUzyty: 1.4, podazKcal: null, podazZaokrKcal: null, dietaNazwa: null, utrzymanieKcal: 1881.5, podazZakresKcal: null },
  masa: { docelowaKg: null },
};
const DANE_PRZYROST = {
  wersja: 1, dorosly: true, strategia: 'przyrost',
  klasyfikacja: { klucz: 'underweight', nadmiar: false, niedowaga: true },
  energia: { teeBazowyKcal: 1502.6, palUzyty: 1.4, podazZaokrKcal: null, utrzymanieKcal: 1768, podazZakresKcal: [2100, 2300] },
  masa: { docelowaKg: 53.465, dolnaNormaKg: 53.465 },
};

describe('Karta „Zapotrzebowanie energetyczne” (wariant A)', () => {
  it('otyłość: bez wiersza „przy obecnej masie”; masa prawidłowa, plan, białko „ok. X g/d” z masy należnej (rata B1), makro w procentach; bez odznaki „Normy”', () => {
    const k = w.patientReportBuildEnergyCardFromData(DANE_DZIECKO_OTYLOSC, {
      celEnergiaKcal: 1866.2, celMasaKg: 41.755, celWlasny: false,
      bialko: { rdaGKg: 0.92, masaKg: 29.46, gDzien: 27.103, rodzaj: 'nalezna' },
      weglProc: [45, 65], tluszczProc: [30, 40],
    });
    expect(k.kind).toBe('energy-demand');
    expect(k.title).toBe('Zapotrzebowanie energetyczne');
    expect(k.badge).toBe('mała aktywność'); // rata R: odznaka slowami, bez PAL
    expect(k.badge).not.toBe('Normy');
    expect(k.value).toBe('1800 kcal/d');
    const wiersze = k.rows.map((r) => `${r.label}: ${r.valueText}`);
    expect(wiersze).toEqual([
      'Dla masy prawidłowej (41,8 kg): 1866 kcal/d',
      'Plan: dieta lekka: 1800 kcal/d',
      'Białko: ok.\u00A027\u00A0g/d',
      'Węglowodany: 45–65 % energii',
      'Tłuszcze: 30–40 % energii',
    ]);
    expect(wiersze.join(' ')).not.toContain('Przy obecnej masie');
    expect(k.rows.find((r) => r.label === 'Białko').detail).toBe('0,92\u00A0g na kg należnej masy ciała (29,5\u00A0kg)');
    expect(JSON.stringify(k.rows)).not.toMatch(/×|≈|masa referencyjna/);
    expect(k.rows.find((r) => r.label.startsWith('Plan')).highlighted).toBe(true);
    expect(k.note).toBe(''); // rata R (decyzja 7): bez noty o wzorze i PAL
    // liczby z masy aktualnej (2412 kcal starej karty) nie mają prawa się pojawić
    expect(JSON.stringify(k)).not.toMatch(/2412|2089/);
  });

  it('BMI w normie: wiersz „przy obecnej masie” = utrzymanie z generatora; bez celu i bez planu', () => {
    const k = w.patientReportBuildEnergyCardFromData(DANE_DOROSLY_NORMA, { bialko: { rdaGKg: 0.83, masaKg: 59.9, gDzien: 49.717, rodzaj: 'bmi22' }, weglProc: [45, 65], tluszczProc: [30, 40] });
    expect(k.value).toBe('1882 kcal/d');
    expect(k.rows.map((r) => r.label)).toEqual(['Przy obecnej masie', 'Białko', 'Węglowodany', 'Tłuszcze']);
    // rata B1: wartość bez wzoru, podstawa w podpisie pod etykietą
    expect(k.rows[1].valueText).toBe('ok.\u00A050\u00A0g/d');
    expect(k.rows[1].detail).toBe('0,83\u00A0g na kg należnej masy ciała (59,9\u00A0kg)');
  });

  it('strategia przyrost: plan jako zakres kcal, wartość główna = plan', () => {
    const k = w.patientReportBuildEnergyCardFromData(DANE_PRZYROST, { celEnergiaKcal: 1847, celMasaKg: 53.465 });
    expect(k.rows.map((r) => `${r.label}: ${r.valueText}`)).toEqual([
      'Dla masy prawidłowej (53,5 kg): 1847 kcal/d',
      'Plan: zalecana kaloryczność: 2100–2300 kcal/d',
    ]);
    expect(k.value).toBe('2100–2300 kcal/d');
  });

  it('cel własny: etykieta wiersza nazywa cel własny', () => {
    const d = { ...DANE_DOROSLY_NORMA, strategia: 'cel-wlasny', masa: { docelowaKg: 58 } };
    const k = w.patientReportBuildEnergyCardFromData(d, { celEnergiaKcal: 1790, celMasaKg: 58, celWlasny: true });
    expect(k.rows[0].label).toBe('Przy obecnej masie');
    expect(k.rows[1].label).toBe('Dla masy docelowej (cel własny, 58,0 kg)');
  });

  it('brak danych generatora → karta „Brak danych”, nigdy stara karta norm', () => {
    const k = w.patientReportBuildEnergyCardFromData(null, {});
    expect(k.kind).toBe('energy-demand');
    expect(k.badge).toBe('Brak danych');
    expect(k.rows).toEqual([]);
  });
});

describe('Pierwszy krok z drabinki (ta sama reguła co plan PDF)', () => {
  const drabDziecko = { dorosly: false, kierunek: 'redukcja', cel: { klucz: 'norma', masa: 41.8, opis: 'górna granica normy dla wieku' },
    szczeble: [{ klucz: 'otylosc', masa: 50.4, opis: 'koniec otyłości' }, { klucz: 'reinehr', masa: 46.9, opis: 'próg poprawy: ciśnienie, trójglicerydy, HDL' }] };
  it('dziecko, pierwszy szczebel 97. centyl: opis w nawiasie, BEZ zdania o korzyści (to próg Reinehra, nie 97c)', () => {
    const k = w.patientReportPierwszyKrok(drabDziecko, 52.6);
    expect(k.masaKg).toBe(50.4); expect(k.roznicaKg).toBeCloseTo(2.2, 6); expect(k.korzysc).toBe(false);
    expect(w.patientReportZdaniePierwszegoKroku(k)).toBe('Pierwszy krok to ok. 50,4 kg (koniec otyłości), czyli około 2,2 kg mniej.');
  });
  it('dziecko, pierwszy szczebel = próg Reinehra: zdanie o korzyści, bez cytowania pracy', () => {
    const d = { ...drabDziecko, szczeble: [drabDziecko.szczeble[1]] };
    const k = w.patientReportPierwszyKrok(d, 48);
    expect(k.korzysc).toBe(true); expect(k.opis).toBe('');
    const z = w.patientReportZdaniePierwszegoKroku(k);
    expect(z).toBe('Pierwszy krok to ok. 46,9 kg, czyli około 1,1 kg mniej; już ta zmiana poprawia ciśnienie i wyniki badań krwi.');
    expect(z).not.toMatch(/Reinehr|doi|HDL|trójglicerydy/);
  });
  it('dorosły: każdy szczebel niesie zdanie o korzyści (jak zdanie A generatora); bez szczebli — „Cel”', () => {
    const d = { dorosly: true, kierunek: 'redukcja', cel: { klucz: 'norma', masa: 69.4, opis: 'górna granica normy' }, szczeble: [{ klucz: 'otylosc-2', masa: 97.6, opis: 'wyjście z otyłości II stopnia' }] };
    const k = w.patientReportPierwszyKrok(d, 112);
    expect(w.patientReportZdaniePierwszegoKroku(k)).toBe('Pierwszy krok to ok. 97,6 kg (wyjście z otyłości II stopnia), czyli około 14,4 kg mniej; już ta zmiana poprawia ciśnienie i wyniki badań krwi.');
    const ref = w.patientReportKrokReference(d, 112);
    expect(ref).toEqual({ available: true, label: 'Pierwszy krok', medianText: 'do 97,6 kg', diffText: 'czyli ok. 14,4 kg mniej (wyjście z otyłości II stopnia); już ta zmiana poprawia ciśnienie i wyniki badań krwi.', neutral: false });
    const bez = { ...d, szczeble: [], cel: { klucz: 'norma', masa: 69.4, opis: 'górna granica normy' } };
    expect(w.patientReportZdaniePierwszegoKroku(w.patientReportPierwszyKrok(bez, 74))).toBe('Cel to ok. 69,4 kg (górna granica normy), czyli około 4,6 kg mniej.');
    expect(w.patientReportKrokReference(bez, 74).label).toBe('Cel');
  });
  it('niedowaga (kierunek przyrost): pole „Cel: dolna granica normy”; w normie — nic', () => {
    const d = { dorosly: true, kierunek: 'przyrost', cel: { klucz: 'norma-dol', masa: 53.5 }, szczeble: [] };
    expect(w.patientReportKrokReference(d, 48)).toEqual({ available: true, label: 'Cel: dolna granica normy', medianText: 'do 53,5 kg', diffText: 'czyli ok. 5,5 kg więcej.', neutral: false });
    expect(w.patientReportKrokReference({ dorosly: true, kierunek: 'w-normie', cel: null, szczeble: [] }, 62)).toBeNull();
    expect(w.patientReportPierwszyKrok(d, 48)).toBeNull();
  });
});

describe('Odniesienia dorosłego: jedna granica normy, bez BMI 22 i bez średnich populacyjnych', () => {
  const h = 1.67, delta = (m) => {
    const lower = 18.5 * h * h, upper = 24.9 * h * h;
    return { state: m > upper ? 'above-normal' : m < lower ? 'underweight' : 'normal', bmi: m / (h * h), lowerWeight: lower, upperWeight: upper, kgToLower: Math.max(0, lower - m), kgAboveUpper: Math.max(0, m - upper), kgToUpper: Math.max(0, upper - m) };
  };
  it('otyłość: masa → górna granica (BMI 24,9); wzrost → zakres masy; BMI → zakres 18,5–24,9', () => {
    const r = w.patientReportAdultMassReference(112, delta(112), { state: 'obesity-3' });
    expect(r.label).toBe('Prawidłowa masa dla tego wzrostu – górna granica (BMI 24,9)');
    expect(r.medianText).toBe('69,4 kg'); expect(r.diffText).toBe('To o 42,6 kg powyżej tej wartości.');
    const hr = w.patientReportAdultHeightRangeReference(112, delta(112));
    expect(hr.medianText).toBe('51,6–69,4 kg'); expect(hr.diffText).toBe('Obecna masa jest o 42,6 kg powyżej tego zakresu.'); expect(hr.neutral).toBe(false);
    const br = w.patientReportAdultBmiRangeReference(40.2, delta(112));
    expect(br.medianText).toBe('18,5–24,9'); expect(br.diffText).toBe('To o 15,3 pkt powyżej górnej granicy.');
    expect(JSON.stringify([r, hr, br])).not.toMatch(/BMI.?22|Polsce|przeciętn|Twoim/i);
  });
  it('niedowaga: masa → dolna granica (BMI 18,5), nie BMI 22', () => {
    const r = w.patientReportAdultMassReference(48, delta(48), { state: 'underweight' });
    expect(r.label).toBe('Prawidłowa masa dla tego wzrostu – dolna granica (BMI 18,5)');
    expect(r.medianText).toBe('51,6 kg'); expect(r.diffText).toBe('To o 3,6 kg poniżej tej wartości.');
    expect(w.patientReportAdultBmiRangeReference(17.2, delta(48)).diffText).toBe('To o 1,3 pkt poniżej dolnej granicy.');
    expect(w.patientReportAdultHeightRangeReference(48, delta(48)).diffText).toBe('Obecna masa jest o 3,6 kg poniżej tego zakresu.');
  });
  it('w normie: masa → górna granica z różnicą; wzrost i BMI → „mieści się”', () => {
    expect(w.patientReportAdultMassReference(62, delta(62), { state: 'normal' }).diffText).toBe('To o 7,4 kg poniżej tej wartości.');
    expect(w.patientReportAdultHeightRangeReference(62, delta(62))).toMatchObject({ diffText: 'Obecna masa mieści się w tym zakresie.', neutral: true });
    expect(w.patientReportAdultBmiRangeReference(22.2, delta(62))).toMatchObject({ diffText: 'BMI mieści się w tym zakresie.', neutral: true });
  });
});

describe('Data pomiaru', () => {
  const teraz = new Date('2026-09-22T14:05:00.000Z');
  it('wczytany rekord sejfu bez zmian w formularzu → data pomiaru z rekordu', () => {
    const r = w.patientReportResolveMeasurementDate({ loaded: { user: { measuredAtISO: '2026-08-01T10:00:00.000Z' } }, modified: false, now: teraz });
    expect(r.source).toBe('loaded'); expect(r.date.toISOString()).toBe('2026-08-01T10:00:00.000Z');
  });
  it('formularz zmieniony po wczytaniu, brak rekordu albo zła data → dziś', () => {
    expect(w.patientReportResolveMeasurementDate({ loaded: { user: { measuredAtISO: '2026-08-01T10:00:00.000Z' } }, modified: true, now: teraz })).toEqual({ date: teraz, source: 'now' });
    expect(w.patientReportResolveMeasurementDate({ loaded: null, modified: false, now: teraz }).source).toBe('now');
    expect(w.patientReportResolveMeasurementDate({ loaded: { user: { measuredAtISO: 'nie-data' } }, modified: false, now: teraz }).source).toBe('now');
  });
});

describe('Strażnik treści raportu (źródło)', () => {
  it('bez żargonu interfejsu, bez „pilnej konsultacji”, bez „idealnej” masy BMI 22 i bez odniesień populacyjnych w kartach', () => {
    expect(ZRODLO).not.toMatch(/G\\u0142\\xF3wny box|Drugi box|Główny box/);
    expect(ZRODLO).not.toMatch(/pilnej konsultacji/);
    expect(ZRODLO).not.toMatch(/patientReportWeightForBmi\(a,22\)/);
    expect(ZRODLO).not.toMatch(/Wynik warto om\\xF3wi\\u0107 podczas konsultacji lekarskiej/);
    expect(ZRODLO).toMatch(/Wynik wymaga leczenia i regularnej kontroli zgodnie z ustaleniami z wizyty/);
    // model raportu bierze karte energii z generatora, nie karte norm
    expect(ZRODLO).toMatch(/f=patientReportBuildEnergyCard\(\)/);
    expect(ZRODLO).not.toMatch(/const f=patientReportBuildNutritionCard\(\)/);
    // dziecko: odniesienie masy do wzrostu (mediana BMI × wzrost²)
    expect(ZRODLO).toMatch(/SH=l&&typeof j=="number"&&isFinite\(j\)&&isFinite\(a\)&&a>0\?j\*\(a\/100\)\*\(a\/100\):null/);
    expect(ZRODLO).toMatch(/Przeci\\u0119tna masa dla tego wzrostu i wieku/);
  });
});
