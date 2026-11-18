import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeAll, describe, expect, it } from 'vitest';
import { loadBrowserScript } from '../support/load-browser-script.mjs';

// P-OTYLOSC-WZROST, etap 1 (decyzje właściciela 2026-11-17/18): rodzic co miesiąc przysyła masę dziecka,
// a wzrostu nie mierzy się co miesiąc. Grupy ChPL dzieci oceniają odpowiedź z BMI, więc ocena liczy się
// z OSTATNIEGO PUNKTU ZE WZROSTEM w oknie oceny, a gdy takiego nie ma — jest wstrzymana („potrzebny
// pomiar wzrostu”). Dorośli (ocena z masy albo kliniczna) — bez zmian: zawsze ostatni punkt.
// Test woła PRODUKCYJNE `ObesityResponseCriteria.punktOceny` i `evaluate`. Dane wyłącznie FIKCYJNE.
//
// Przykład z makiety (zaakceptowanej 2026-11-18): Testowa Zuzanna, 13 l., Wegovy. Włączenie 14.04.2026
// (80,0 kg, 160,0 cm). Okno oceny Wegovy 12–17 l.: 12 tyg. dawki podtrzymującej po nominalnych 16 tyg.
// zwiększania dawki = od 28. tygodnia, czyli od 27.10.2026.

let K;
beforeAll(() => {
  K = loadBrowserScript('obesity_response_criteria.js', {}).ObesityResponseCriteria;
});

const korzen = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

const WEGOVY = 'Wegovy (semaglutyd) – s.c. 1×/tydz.';
const SAXENDA = 'Saxenda (liraglutyd) – s.c. 1×/dobę';
const pkt = (id, type, dateISO, lata, mies, weight, height, drug = WEGOVY) =>
  ({ id, type, dateISO, ageYears: lata, ageMonths: mies, weight, height, drug, dose: '2,4 mg / tydz.' });

const WL = pkt('w', 'start', '2026-04-14', 13, 0, 80, 160);
const WRZ = pkt('k5', 'continue', '2026-09-15', 13, 5, 75.9, null);
const PAZ = pkt('k6', 'continue', '2026-10-13', 13, 6, 75.2, 162.9); // 26. tydz. — przed oknem
const LIS10 = pkt('k7', 'continue', '2026-11-10', 13, 7, 74.6, null); // 30. tydz. — okno trwa
const LIS17 = pkt('k8', 'continue', '2026-11-17', 13, 7, 74.3, 163.4); // 31. tydz.
const GRU = pkt('k9', 'continue', '2026-12-15', 13, 8, 73.8, ''); // 35. tydz.

const dziecko = (lek = 'Wegovy', wiek = 13) => K.getCriterion(lek, '', wiek);

describe('dziecko, Wegovy 12–17 l. (redukcja BMI)', () => {
  it('ostatni punkt ze wzrostem — ocena z ostatniego punktu, jak dotąd', () => {
    const r = K.punktOceny(dziecko(), [WL, WRZ, PAZ, LIS10, LIS17]);
    expect(r.tryb).toBe('ostatni');
    expect(r.punkt).toBe(LIS17);
    expect(r.metrykaBmi).toBe(true);
    expect(r.tygodnie).toBe(31);
    expect(r.zWieku).toBe(false);
    expect(r.ostatniZeWzrostem).toBe(LIS17);
  });

  it('okno trwa, ostatni wzrost sprzed okna — ocena wstrzymana: potrzebny pomiar wzrostu', () => {
    const r = K.punktOceny(dziecko(), [WL, WRZ, PAZ, LIS10]);
    expect(r.tryb).toBe('potrzebny-wzrost');
    expect(r.punkt).toBeNull();
    expect(r.ostatniZeWzrostem).toBe(PAZ);
    expect(r.oknoOdTygodnia).toBe(28);
    expect(r.oknoOdISO).toBe('2026-10-27');
    expect(r.tygodnie).toBe(30);
    // Kontrola: ta sama lista z ostatnim punktem przeliczonym jak dotąd dałaby „za mało danych”
    // (BMI ostatniego punktu nie istnieje) — stan wstrzymania niczego nie zgaduje.
    const dawniej = K.evaluate(dziecko(), { weeks: 30, massPct: (74.6 / 80 - 1) * 100, bmiPct: null });
    expect(dawniej.status).toBe('insufficient-data');
  });

  it('okno trwa, ostatni punkt bez wzrostu, wcześniejszy punkt w oknie ma wzrost — ocena z niego', () => {
    const r = K.punktOceny(dziecko(), [WL, WRZ, PAZ, LIS10, LIS17, GRU]);
    expect(r.tryb).toBe('ostatni-ze-wzrostem');
    expect(r.punkt).toBe(LIS17);
    expect(r.tygodnie).toBe(31);
    // Ocena z tego punktu: BMI 31,25 → 27,83 kg/m² (−10,9 %) ≥ 5 % — odpowiedź wystarczająca.
    const bmi = (p) => p.weight / Math.pow(p.height / 100, 2);
    const e = K.evaluate(dziecko(), { weeks: r.tygodnie, bmiPct: (bmi(LIS17) / bmi(WL) - 1) * 100 });
    expect(e.status).toBe('pass');
    expect(e.achievedPct).toBeCloseTo(-10.94, 1);
  });

  it('okno jeszcze zamknięte w ostatnim punkcie bez wzrostu — ostatni punkt (stan „przed oknem” jak dotąd)', () => {
    const r = K.punktOceny(dziecko(), [WL, WRZ]);
    expect(r.tryb).toBe('ostatni');
    expect(r.punkt).toBe(WRZ);
    expect(r.ostatniZeWzrostem).toBeNull();
    expect(K.evaluate(dziecko(), { weeks: r.tygodnie }).status).toBe('before-window');
  });

  it('Włączenie bez wzrostu (stary zapis), okno trwa — ocena wstrzymana z własnym powodem', () => {
    const wl = { ...WL, height: null };
    const r = K.punktOceny(dziecko(), [wl, PAZ, LIS17]);
    expect(r.tryb).toBe('brak-wzrostu-wlaczenia');
    expect(r.punkt).toBeNull();
    // Przed oknem — stan „przed oknem” jak dotąd.
    expect(K.punktOceny(dziecko(), [wl, WRZ]).tryb).toBe('ostatni');
  });

  it('zapisane BMI bez wzrostu liczy się jak w Karcie (An)', () => {
    const r = K.punktOceny(dziecko(), [WL, PAZ, { ...LIS10, bmi: 28.1 }]);
    expect(r.tryb).toBe('ostatni');
  });

  it('wzrost tekstem z formularza, zero i pusty tekst', () => {
    expect(K.punktOceny(dziecko(), [WL, PAZ, { ...LIS10, height: '163.0' }]).tryb).toBe('ostatni');
    expect(K.punktOceny(dziecko(), [WL, PAZ, { ...LIS10, height: 0 }]).tryb).toBe('potrzebny-wzrost');
    expect(K.punktOceny(dziecko(), [WL, PAZ, { ...LIS10, height: '' }]).tryb).toBe('potrzebny-wzrost');
  });

  it('bez dat — tygodnie z różnicy wieku (jak w Karcie), znak „z wieku” przenosi się do wyniku', () => {
    const bez = (p) => ({ ...p, dateISO: '' });
    const r = K.punktOceny(dziecko(), [bez(WL), bez(PAZ), bez(LIS17), bez(GRU)]);
    expect(r.tryb).toBe('ostatni-ze-wzrostem');
    expect(r.punkt.id).toBe('k8');
    expect(r.tygodnie).toBe(Math.round(7 * 4.345));
    expect(r.zWieku).toBe(true);
    expect(r.oknoOdISO).toBeNull();
  });
});

describe('dziecko, Saxenda 12–17 l. (BMI lub BMI z-score), okno od 16. tygodnia', () => {
  const S = (p) => ({ ...p, drug: SAXENDA, dose: '3,0 mg / dobę' });
  it('okno trwa w 18. tyg., wzrost tylko przy Włączeniu — potrzebny pomiar wzrostu', () => {
    const g = K.getCriterion('Saxenda', '', 13);
    expect(g.group.metric).toBe('bmiPctOrZscore');
    const r = K.punktOceny(g, [S(WL), S(pkt('k', 'continue', '2026-08-18', 13, 4, 77, null))]);
    expect(r.tygodnie).toBe(18);
    expect(r.oknoOdTygodnia).toBe(16);
    expect(r.tryb).toBe('potrzebny-wzrost');
  });
});

describe('dorośli — bez zmian: zawsze ostatni punkt', () => {
  const D = (p, drug) => ({ ...p, ageYears: 40, drug });
  it.each([
    ['Saxenda dorośli (redukcja masy)', 'Saxenda', SAXENDA, 'massPct'],
    ['Mysimba dorośli (redukcja masy)', 'Mysimba', 'Mysimba', 'massPct'],
    ['Wegovy dorośli (ocena kliniczna)', 'Wegovy', WEGOVY, 'clinical'],
    ['Mounjaro dorośli (ocena kliniczna)', 'Mounjaro', 'Mounjaro', 'clinical'],
  ])('%s', (_n, lek, drug, metryka) => {
    const g = K.getCriterion(lek, '', 40);
    expect(g.group.metric).toBe(metryka);
    const r = K.punktOceny(g, [D(WL, drug), D(PAZ, drug), D(LIS10, drug)]);
    expect(r.tryb).toBe('ostatni');
    expect(r.punkt.id).toBe('k7');
    expect(r.metrykaBmi).toBe(false);
  });
});

describe('dane brzegowe', () => {
  it('pusta lista, brak kryterium, jeden punkt', () => {
    expect(K.punktOceny(dziecko(), []).punkt).toBeNull();
    expect(K.punktOceny(dziecko(), null).tryb).toBe('ostatni');
    expect(K.punktOceny(null, [WL, LIS10]).punkt).toBe(LIS10);
    const jeden = K.punktOceny(dziecko(), [WL]);
    expect(jeden.punkt).toBe(WL);
    expect(jeden.tygodnie).toBeNull();
  });

  it('tygodnieOceny: daty wstecz → z wieku; ten sam punkt → brak', () => {
    expect(K.tygodnieOceny(WL, WL)).toEqual({ tygodnie: null, zWieku: false });
    expect(K.tygodnieOceny(WL, { ...PAZ, dateISO: '2026-01-01' })).toEqual({ tygodnie: Math.round(6 * 4.345), zWieku: true });
    expect(K.tygodnieOceny(WL, { ...PAZ, dateISO: '13.10.2026' })).toEqual({ tygodnie: 26, zWieku: false });
  });

  it('obiekt modułu dalej zamrożony, progi i okna bez zmian', () => {
    expect(Object.isFrozen(K)).toBe(true);
    const g = dziecko().group;
    expect([g.windowWeeks, g.titrationWeeksNominal, g.thresholdPct, g.metric]).toEqual([12, 16, 5, 'bmiPct']);
  });
});

// Tygodnie modułu muszą być tymi samymi tygodniami, które Karta liczy dla ostatniego punktu (S/Q w Ob_b):
// z dat (Da) albo z różnicy wieku (Ye × 4,345). Funkcje Karty są wycięte z produkcyjnego vilda_auth_ui.js.
describe('zgodność tygodni z Kartą pacjenta', () => {
  const AUTH = fs.readFileSync(path.join(korzen, 'vilda_auth_ui.js'), 'utf8');
  const od = AUTH.indexOf('function Ye(');
  const ye = new Function(`${AUTH.slice(od, AUTH.indexOf('function An(', od))}\nreturn { Ye, Da };`)();
  const karta = (l, c) => {
    const w = ye.Da(l.dateISO), W = ye.Da(c.dateISO), F = ye.Ye(c) - ye.Ye(l);
    if (c !== l && w != null && W != null && W >= w) return Math.round((W - w) / (7 * 24 * 3600 * 1e3));
    return c !== l && F > 0 ? Math.round(F * 4.345) : null;
  };
  it.each([
    ['przez zmianę czasu (marzec)', '2026-01-05', '2026-04-27'],
    ['przez zmianę czasu (październik)', '2026-04-14', '2026-11-10'],
    ['ten sam dzień', '2026-04-14', '2026-04-14'],
    ['bez daty kontroli', '2026-04-14', ''],
    ['format DD.MM.RRRR', '2026-04-14', '13.10.2026'],
  ])('%s', (_n, a, b) => {
    const l = { ...WL, dateISO: a }, c = { ...PAZ, dateISO: b };
    expect(K.tygodnieOceny(l, c).tygodnie).toBe(karta(l, c));
  });
});
