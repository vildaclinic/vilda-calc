import { describe, expect, it } from 'vitest';
import { loadBrowserScript } from '../support/load-browser-script.mjs';

// P-BAZA-STATYSTYKI, etap 3 (decyzja właściciela 2026-11-24): statystyki leczenia otyłości.
// Model z PLIKU PRODUKCYJNEGO (vilda_patients_list.js) uruchomiony na PRAWDZIWYCH silnikach:
// cykle dzieli VildaCykleLeczenia.podziel, tygodnie leczenia liczy ObesityResponseCriteria.tygodnieOceny,
// BMI i granicę dziecko/dorosły daje VildaBmi, progi redukcji — plik pasm VildaPostepyDoroslegoDane.
// Wszystkie osoby i pomiary są fikcyjne.

function srodowisko() {
  const win = {};
  loadBrowserScript('obesity_response_criteria.js', win);
  loadBrowserScript('vilda_cykle_leczenia.js', win);
  loadBrowserScript('vilda_bmi.js', win);
  loadBrowserScript('vilda_postepy_doroslego_dane.js', win);
  loadBrowserScript('vilda_patients_list.js', win);
  const deps = {
    cykle: win.VildaCykleLeczenia.podziel,
    lek: win.VildaCykleLeczenia.nazwaLeku,
    tygodnie: (start, punkt) => win.ObesityResponseCriteria.tygodnieOceny(start, punkt).tygodnie,
    bmi: win.VildaBmi.bmi,
    dorosly: win.VildaBmi.dorosly,
  };
  return { ...win.VildaPatientsList, deps, win };
}
const WEGOVY = { drug: 'Wegovy (semaglutyd) – s.c. 1×/tydz.', substance: 'Semaglutyd (agonista receptora GLP‑1)' };
const SAXENDA = { drug: 'Saxenda (liraglutyd) – s.c. 1×/dobę', substance: 'Liraglutyd (agonista receptora GLP‑1)' };
const punkt = (type, dateISO, lata, mies, weight, height, extra = {}) => ({ type, dateISO, ageYears: lata, ageMonths: mies, weight, height, ...extra });
const MIESIAC_TYG = 365.25 / 12 / 7;

// Dorosła, Wegovy: 100,0 kg → po 12 tyg. 94,0 → po 26 tyg. 88,0.
const FELICJA = [
  punkt('start', '2025-10-01', 20, 4, 100.0, 166, WEGOVY),
  punkt('continue', '2025-12-24', 20, 7, 94.0, 166, WEGOVY),
  punkt('continue', '2026-04-01', 20, 10, 88.0, null, WEGOVY),
];
// Dziecko (11 l. 5 mies.), Saxenda: 60,0 kg/145 cm → po 13 tyg. 58,2/146 → po 26 tyg. 57,0/147.
const DOROTA = [
  punkt('start', '2025-09-10', 11, 5, 60.0, 145, SAXENDA),
  punkt('continue', '2025-12-10', 11, 8, 58.2, 146, SAXENDA),
  punkt('continue', '2026-03-11', 11, 11, 57.0, 147, SAXENDA),
];
const bmi = (masa, wzrost) => masa / Math.pow(wzrost / 100, 2);

describe('Jeden pacjent leczony z powodu otyłości (obesityPatient)', () => {
  it('silniki liczą tygodnie z dat, a dorosłość od 18 lat — model bierze je z silników', () => {
    const { deps } = srodowisko();
    expect(deps.tygodnie(FELICJA[0], FELICJA[1])).toBe(12);
    expect(deps.tygodnie(FELICJA[0], FELICJA[2])).toBe(26);
    expect(deps.tygodnie(DOROTA[0], DOROTA[1])).toBe(13);
    expect(deps.dorosly(215, 'OGOLNA')).toBe(false);
    expect(deps.dorosly(216, 'OGOLNA')).toBe(true);
  });

  it('dorosła: zmiana masy po 12 tyg. i po 6 mies. od masy Włączenia; tempo w kg/mies.; bez BMI dziecka', () => {
    const { obesityPatient, deps } = srodowisko();
    const wynik = obesityPatient({ user: { sex: 'F' } }, FELICJA, deps);
    expect(wynik.drug).toBe('Wegovy');
    expect(wynik.child).toBe(false);
    expect(wynik.windows.w12.weeks).toBe(12);
    expect(wynik.windows.w12.pct).toBeCloseTo(-6.0, 9);
    expect(wynik.windows.w12.kg).toBeCloseTo(-6.0, 9);
    expect(wynik.windows.w12.kgPerMonth).toBeCloseTo(-6 / (12 / MIESIAC_TYG), 9);
    expect(wynik.windows.m6.weeks).toBe(26);
    expect(wynik.windows.m6.pct).toBeCloseTo(-12.0, 9);
    expect(wynik.windows.m6.kgPerMonth).toBeCloseTo(-2.007, 3);
    expect(wynik.windows.m6.bmiPct).toBeNull();
    expect(wynik.reasons).toEqual({ w12: null, m6: null });
  });

  it('dziecko: obok masy zmiana BMI % i BMI-SDS z punktów okna (BMI z masy i wzrostu silnikiem BMI)', () => {
    const { obesityPatient, deps } = srodowisko();
    const zapytania = [];
    const bmiSds = (wejscie) => { zapytania.push(wejscie); return wejscie.bmi / 10; };
    const wynik = obesityPatient({ user: { sex: 'F' }, zscore: { dataSource: 'olaf' } }, DOROTA, { ...deps, bmiSds });
    expect(wynik.drug).toBe('Saxenda');
    expect(wynik.child).toBe(true);
    const b0 = bmi(60, 145), b13 = bmi(58.2, 146), b26 = bmi(57, 147);
    expect(wynik.windows.w12.pct).toBeCloseTo(-3.0, 9);
    expect(wynik.windows.w12.bmiPct).toBeCloseTo((b13 - b0) / b0 * 100, 9);
    expect(wynik.windows.w12.bmiSds).toBeCloseTo((b13 - b0) / 10, 9);
    expect(wynik.windows.m6.pct).toBeCloseTo(-5.0, 9);
    expect(wynik.windows.m6.bmiPct).toBeCloseTo((b26 - b0) / b0 * 100, 9);
    expect(wynik.windows.m6.bmiPct).toBeCloseTo(-7.57, 2);
    // BMI-SDS: wiek punktu w miesiącach, płeć i siatka z karty, populacja jawnie.
    expect(zapytania[0]).toMatchObject({ plec: 'F', wiekMies: 137, zrodlo: 'OLAF', populacja: 'OGOLNA' });
    expect(zapytania.map((z) => z.wiekMies)).toEqual([137, 140, 143]);
  });

  it('z okna wybiera pomiar najbliższy celu; przy równej odległości — wcześniejszy', () => {
    const { obesityPatient, deps } = srodowisko();
    const start = punkt('start', '2026-01-05', 30, 0, 100, 170, WEGOVY);
    const tydzien = (n, masa) => {
      const d = new Date(2026, 0, 5 + 7 * n);
      const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      return punkt('continue', iso, 30, Math.floor(n / 4.345), masa, 170, WEGOVY);
    };
    const blisko = obesityPatient({}, [start, tydzien(9, 97), tydzien(13, 95), tydzien(15, 94)], deps);
    expect(blisko.windows.w12.weeks).toBe(13);
    expect(blisko.windows.w12.pct).toBeCloseTo(-5, 9);
    const remis = obesityPatient({}, [start, tydzien(10, 96), tydzien(14, 93)], deps);
    expect(remis.windows.w12.weeks).toBe(10);
    // Okno 6 mies.: 20–32 tyg., cel 26.
    const pol = obesityPatient({}, [start, tydzien(19, 92), tydzien(22, 91), tydzien(31, 89), tydzien(33, 88)], deps);
    expect(pol.windows.m6.weeks).toBe(22);
    expect(pol.windows.m6.pct).toBeCloseTo(-9, 9);
  });

  it('dziecko: masa z wpisu bez wzrostu, BMI z najbliższej wizyty ze wzrostem w tym samym oknie', () => {
    const { obesityPatient, deps } = srodowisko();
    const wynik = obesityPatient({ user: { sex: 'M' } }, [
      punkt('start', '2026-01-05', 14, 0, 80.0, 160, WEGOVY),
      punkt('continue', '2026-03-30', 14, 2, 77.6, null, WEGOVY),   // 12 tyg., masa od rodzica
      punkt('continue', '2026-04-13', 14, 3, 77.0, 161, WEGOVY),    // 14 tyg., wizyta ze wzrostem
    ], deps);
    expect(wynik.windows.w12.weeks).toBe(12);
    expect(wynik.windows.w12.pct).toBeCloseTo(-3.0, 9);
    expect(wynik.windows.w12.bmiPct).toBeCloseTo((bmi(77, 161) - bmi(80, 160)) / bmi(80, 160) * 100, 9);
    expect(wynik.windows.w12.bmiSds, 'bez silnika BMI-SDS zmiany SDS nie ma').toBeNull();
  });

  it('punkty bez dat: tygodnie z różnicy wieku (silnik kryteriów)', () => {
    const { obesityPatient, deps } = srodowisko();
    const wynik = obesityPatient({}, [
      { type: 'start', ageYears: 15, ageMonths: 0, weight: 90, height: 170, ...SAXENDA },
      { type: 'continue', ageYears: 15, ageMonths: 3, weight: 87.3, height: 171, ...SAXENDA },
      { type: 'continue', ageYears: 15, ageMonths: 6, weight: 85.5, height: 172, ...SAXENDA },
    ], deps);
    expect(wynik.windows.w12.weeks).toBe(13);
    expect(wynik.windows.w12.pct).toBeCloseTo(-3.0, 9);
    expect(wynik.windows.m6.weeks).toBe(26);
    expect(wynik.windows.m6.pct).toBeCloseTo(-5.0, 9);
  });

  it('pacjent bez pomiaru w oknie dostaje powód, osobno dla każdego okna', () => {
    const { obesityPatient, deps } = srodowisko();
    const start = punkt('start', '2026-01-05', 30, 0, 100, 170, WEGOVY);
    const krotko = obesityPatient({}, [start, punkt('continue', '2026-02-16', 30, 1, 97, 170, WEGOVY)], deps);       // 6 tyg.
    expect(krotko.reasons).toEqual({ w12: 'too-early', m6: 'too-early' });
    const miedzy = obesityPatient({}, [start, punkt('continue', '2026-05-11', 30, 4, 93, 170, WEGOVY)], deps);       // 18 tyg.
    expect(miedzy.reasons).toEqual({ w12: 'no-control', m6: 'too-early' });
    const pozno = obesityPatient({}, [start, punkt('continue', '2026-10-12', 30, 9, 88, 170, WEGOVY)], deps);        // 40 tyg.
    expect(pozno.reasons).toEqual({ w12: 'no-control', m6: 'no-control' });
    expect(pozno.windows).toEqual({ w12: null, m6: null });
    const bezWlaczenia = obesityPatient({}, [punkt('continue', '2026-01-05', 7, 0, 40, 123, SAXENDA)], deps);
    expect(bezWlaczenia.reasons).toEqual({ w12: 'no-start', m6: 'no-start' });
    expect(bezWlaczenia.drug).toBe('Saxenda');
    const bezMasy = obesityPatient({}, [{ ...start, weight: null }, punkt('continue', '2026-03-30', 30, 2, 95, 170, WEGOVY)], deps);
    expect(bezMasy.reasons).toEqual({ w12: 'no-start', m6: 'no-start' });
  });

  it('liczy się pierwszy cykl z Włączeniem; leczenie wznowione innym lekiem nie zmienia wyniku', () => {
    const { obesityPatient, deps } = srodowisko();
    const wynik = obesityPatient({}, [
      punkt('start', '2025-01-06', 30, 0, 100, 170, SAXENDA),
      punkt('continue', '2025-03-31', 30, 2, 96, 170, SAXENDA),      // 12 tyg.
      punkt('end', '2025-05-05', 30, 3, 95, 170, SAXENDA),           // 17 tyg. — koniec cyklu
      punkt('start', '2025-09-01', 30, 7, 97, 170, WEGOVY),
      punkt('continue', '2025-11-24', 30, 10, 90, 170, WEGOVY),
      punkt('continue', '2026-03-02', 31, 1, 84, 170, WEGOVY),
    ], deps);
    expect(wynik.drug).toBe('Saxenda');
    expect(wynik.windows.w12.pct).toBeCloseTo(-4.0, 9);
    expect(wynik.windows.m6).toBeNull();
    expect(wynik.reasons).toEqual({ w12: null, m6: 'too-early' });
  });

  it('karta bez punktów leczenia otyłości nie jest „leczona”; bez silników wynik ma powód, nie liczby', () => {
    const { obesityPatient, deps } = srodowisko();
    expect(obesityPatient({}, [], deps)).toBeNull();
    expect(obesityPatient({}, null, deps)).toBeNull();
    expect(obesityPatient({}, [{ type: 'inny', weight: 80 }], deps)).toBeNull();
    const bez = obesityPatient({}, FELICJA, { lek: deps.lek });
    expect(bez.reasons).toEqual({ w12: 'no-engine', m6: 'no-engine' });
    expect(bez.windows).toEqual({ w12: null, m6: null });
    expect(bez.drug).toBe('Wegovy');
  });
});

describe('Kohorta leczonych z powodu otyłości (obesityCohort)', () => {
  const wpis = (id, lek, dziecko, w12, m6, powody = {}) => ({
    id,
    ob: {
      drug: lek, child: dziecko,
      windows: {
        w12: w12 === null ? null : { weeks: 12, pct: w12, kg: w12, kgPerMonth: w12 / 3, bmiPct: null, bmiSds: null, ...(powody.bmi12 || {}) },
        m6: m6 === null ? null : { weeks: 26, pct: m6, kg: m6, kgPerMonth: m6 / 6, bmiPct: null, bmiSds: null, ...(powody.bmi6 || {}) },
      },
      reasons: { w12: powody.w12 || null, m6: powody.m6 || null },
    },
  });

  it('progi redukcji to szczeble wspólne wszystkim drabinkom pasm aplikacji: 5 i 10%', () => {
    const { obesityThresholds, win } = srodowisko();
    expect(obesityThresholds(win.VildaPostepyDoroslegoDane)).toEqual([5, 10]);
    expect(obesityThresholds(null)).toEqual([]);
    expect(obesityThresholds({ ZESTAWY: { A: { progi: [10, 5, 15] }, B: { progi: [5, 15] } } })).toEqual([5, 15]);
  });

  it('średnia, mediana, liczebność, osiągnięte progi, przyrosty, leki i pacjenci bez wyniku', () => {
    const { obesityCohort } = srodowisko();
    const kohorta = obesityCohort([
      wpis('d', 'Saxenda', true, -3.0, -5.0, { bmi6: { bmiPct: -7.5, bmiSds: -0.3 } }),
      wpis('e', 'Wegovy', true, -4.2, null, { m6: 'too-early' }),
      wpis('f', 'Wegovy', false, -6.0, -12.0),
      wpis('g', 'Saxenda', null, null, null, { w12: 'no-start', m6: 'no-start' }),
      wpis('h', 'Saxenda', true, 2.0, 3.0, { bmi6: { bmiPct: -1.5, bmiSds: null } }),
      { id: 'x', ob: null },
    ], { thresholds: [5, 10] });
    expect(kohorta.treated).toBe(5);
    expect(kohorta.children).toBe(3);
    expect(kohorta.adults).toBe(1);
    const w12 = kohorta.windows.w12, m6 = kohorta.windows.m6;
    expect(w12.n).toBe(4);
    expect(w12.mean).toBeCloseTo(-2.8, 9);
    expect(w12.median).toBeCloseTo(-3.6, 9);
    expect(w12.ids).toEqual(['d', 'e', 'f', 'h']);
    expect(m6.n).toBe(3);
    expect(m6.mean).toBeCloseTo(-14 / 3, 9);
    expect(m6.median).toBeCloseTo(-5.0, 9);
    expect(m6.kgPerMonth).toBeCloseTo((-5 / 6 - 2 + 0.5) / 3, 9);
    expect(m6.gained).toEqual(['h']);
    expect(m6.thresholds).toEqual([{ threshold: 5, n: 2, ids: ['d', 'f'] }, { threshold: 10, n: 1, ids: ['f'] }]);
    expect(m6.bmi).toMatchObject({ n: 2, sdsN: 1 });
    expect(m6.bmi.mean).toBeCloseTo(-4.5, 9);
    expect(m6.bmi.sds).toBeCloseTo(-0.3, 9);
    expect(m6.people.map((osoba) => osoba.id), 'od najmniejszej do największej redukcji').toEqual(['h', 'd', 'f']);
    expect(kohorta.missing.w12).toEqual({ 'no-start': ['g'], 'no-control': [], 'too-early': [] });
    expect(kohorta.missing.m6).toEqual({ 'no-start': ['g'], 'no-control': [], 'too-early': ['e'] });
    expect(kohorta.drugs.map((lek) => [lek.drug, lek.treated, lek.windows.w12.n, lek.windows.m6.n, lek.small])).toEqual([
      ['Saxenda', 3, 2, 2, true],
      ['Wegovy', 2, 2, 1, true],
    ]);
    expect(kohorta.drugs[0].windows.w12.mean).toBeCloseTo(-0.5, 9);
    expect(kohorta.drugs[1].windows.m6.mean).toBeCloseTo(-12.0, 9);
  });

  it('redukcja dokładnie o próg liczy się jako osiągnięta; pusta kohorta nie udaje liczb', () => {
    const { obesityPatient, obesityCohort, deps } = srodowisko();
    const rowno = obesityPatient({}, [
      punkt('start', '2026-01-05', 30, 0, 95, 170, WEGOVY),
      punkt('continue', '2026-07-06', 30, 6, 90.25, 170, WEGOVY),   // 26 tyg., dokładnie −5%
    ], deps);
    const kohorta = obesityCohort([{ id: 'r', ob: rowno }], { thresholds: [5, 10] });
    expect(kohorta.windows.m6.thresholds.map((prog) => prog.n)).toEqual([1, 0]);
    const pusta = obesityCohort([], { thresholds: [5, 10] });
    expect(pusta.treated).toBe(0);
    expect(pusta.windows.m6).toMatchObject({ n: 0, mean: null, median: null, kgPerMonth: null });
    expect(pusta.drugs).toEqual([]);
    const bezProgow = obesityCohort([{ id: 'r', ob: rowno }]);
    expect(bezProgow.windows.m6.thresholds).toEqual([]);
  });
});

// P-BAZA-SZYBKIE (decyzja właściciela 2026-11-24): liczenie przyrostowe — które karty trzeba przeczytać ponownie.
describe('Liczenie przyrostowe (journalIndex, cardsPlan, cardsResult)', () => {
  const notatka = (id, patientId, updatedAtISO, category = 'leczenie-otylosci') => ({ id, patientId, category, createdAtISO: '2026-01-01T10:00:00.000Z', updatedAtISO });
  const jestWpisem = (note) => note.category === 'leczenie-otylosci';
  const karta = (patientId, lastSavedAtISO) => ({ patientId, lastSavedAtISO });
  const wynik = (stamp, journal, extra = {}) => ({ stamp, journal, read: true, card: { measurements: true, parents: false, birthWeight: true }, gh: null, ob: null, partial: false, ...extra });

  it('znacznik wpisów pacjenta zmienia się po dopisaniu, poprawce i usunięciu wpisu, a nie zależy od kolejności ani cudzych notatek', () => {
    const { journalIndex } = srodowisko();
    const a = journalIndex([notatka('n1', 'p1', 't1'), notatka('n2', 'p1', 't2'), notatka('n3', 'p2', 't3'), notatka('x', 'p1', 't9', 'followup')], jestWpisem);
    expect(a.of('p1').map((note) => note.id)).toEqual(['n1', 'n2']);
    expect(a.of('p3')).toEqual([]);
    expect(a.mark('p1')).toBe('n1@t1|n2@t2');
    expect(a.mark('p3')).toBe('');
    expect(journalIndex([notatka('n2', 'p1', 't2'), notatka('n1', 'p1', 't1')], jestWpisem).mark('p1'), 'kolejność odczytu bez znaczenia').toBe(a.mark('p1'));
    expect(journalIndex([notatka('n1', 'p1', 't1'), notatka('n2', 'p1', 't2'), notatka('n4', 'p1', 't4')], jestWpisem).mark('p1'), 'dopisany wpis').not.toBe(a.mark('p1'));
    expect(journalIndex([notatka('n1', 'p1', 't1'), notatka('n2', 'p1', 't5')], jestWpisem).mark('p1'), 'poprawiony wpis').not.toBe(a.mark('p1'));
    expect(journalIndex([notatka('n1', 'p1', 't1')], jestWpisem).mark('p1'), 'usunięty wpis').not.toBe(a.mark('p1'));
    expect(journalIndex(null, jestWpisem).mark('p1')).toBe('');
  });

  it('czytane są tylko karty nowe, zmienione, z innymi wpisami albo wcześniej nieodczytane', () => {
    const { cardsPlan } = srodowisko();
    const baza = [karta('p1', 's1'), karta('p2', 's2'), karta('p3', 's3'), karta('p4', 's4'), karta('p5', 's5')];
    const pamiec = {
      p1: wynik('s1', ''),                       // bez zmian
      p2: wynik('stara-chwila', ''),             // karta zapisana ponownie
      p3: wynik('s3', 'n1@t1'),                  // dopisany wpis między wizytami
      p4: wynik('s4', '', { read: false }),      // poprzednio nie udało się odczytać
    };                                           // p5: nowa karta
    const znacznik = (id) => (id === 'p3' ? 'n1@t1|n2@t2' : '');
    const plan = cardsPlan(baza, pamiec, znacznik);
    expect(Object.keys(plan.kept)).toEqual(['p1']);
    expect(plan.kept.p1).toBe(pamiec.p1);
    expect(plan.stale.map((record) => record.patientId)).toEqual(['p2', 'p3', 'p4', 'p5']);
    // Bez pamięci (pierwsze liczenie albo „Policz ponownie”) czytane jest wszystko.
    expect(cardsPlan(baza, null, znacznik).stale).toHaveLength(5);
    // Pacjent usunięty z bazy znika z wyniku, choć jego wynik był w pamięci.
    expect(Object.keys(cardsPlan([karta('p1', 's1')], { ...pamiec, p9: wynik('s9', '') }, znacznik).kept)).toEqual(['p1']);
  });

  it('wynik zbiorczy: braki danych, leczeni, karty nieodczytane i wpisy, których nie udało się odczytać', () => {
    const { cardsResult } = srodowisko();
    const gh = { program: 'SNP' }, ob = { drug: 'Wegovy' };
    const zbior = cardsResult([karta('p1', 's1'), karta('p2', 's2'), karta('p3', 's3'), karta('p4', 's4')], {
      p1: wynik('s1', '', { gh }),
      p2: wynik('s2', '', { ob, partial: true, card: { measurements: false, parents: false, birthWeight: false } }),
      p3: wynik('s3', '', { read: false, card: null }),
    });
    expect(zbior.total).toBe(4);
    expect(zbior.failed, 'p3 nieodczytana, p4 bez wyniku').toBe(2);
    expect(zbior.missing).toEqual({ measurements: ['p2'], parents: ['p1', 'p2'], birthWeight: ['p2'] });
    expect(zbior.treated).toEqual([{ id: 'p1', gh }]);
    expect(zbior.obese).toEqual([{ id: 'p2', ob }]);
    expect(zbior.partial).toBe(1);
    expect(zbior.details.map((item) => [item.id, Boolean(item.card)])).toEqual([['p1', true], ['p2', true], ['p3', false], ['p4', false]]);
  });
});
