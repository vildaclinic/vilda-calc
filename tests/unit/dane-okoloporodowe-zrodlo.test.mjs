import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeAll, describe, expect, it } from 'vitest';

const korzen = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

// Sekcja „Dane okołoporodowe" z Karty Pacjenta jako źródło danych urodzeniowych.
//
// Do 1.0.863 te same liczby żyły w trzech miejscach, a przy liczeniu SGA czytane były
// tylko dwa: karta SGA i sekcja `birth` rekordu. Pacjent z kompletem danych wpisanym
// wyłącznie w Karcie Pacjenta nie dostawał ani zdania o braku catch-upu, ani ściągi B.64
// — a na index.html karty SGA w ogóle nie ma, więc nie dostawał ich nigdy.
//
// Testy pilnują trzech rzeczy, które w takim adapterze psują się po cichu:
//   1. mapowania nazw pól (rekord mówi `birthWeightG`, karta mówi `weight`);
//   2. pierwszeństwa źródeł — świeższa karta nie może zostać przykryta rekordem;
//   3. płci — silnik karty SGA traktuje KAŻDĄ wartość inną niż żeńska jako chłopca,
//      a sekcja „Dane okołoporodowe" płci nie niesie.

function zrodlo(nazwa) {
  return fs.readFileSync(path.join(korzen, nazwa), 'utf8');
}

let P;
beforeAll(() => {
  const okno = {};
  new Function('window', zrodlo('vilda_perinatal_source.js'))(okno);
  P = okno.VildaPerinatalSource;
});

// Sekcja rekordu tak, jak zapisuje ją vilda_auth_ui.js (wartości są tekstem z formularza).
const PERINATAL = {
  gestationalWeeks: '34',
  gestationalDays: '2',
  birthWeightG: '1850',
  birthLengthCm: '43',
  birthHeadCircCm: '31',
  gravidity: '2',
  parity: '2',
};

describe('Zamiana sekcji „Dane okołoporodowe" na kształt karty SGA', () => {
  it('przepisuje pięć pomiarów pod nazwy, których używa karta', () => {
    const s = P.naKarte(PERINATAL, 'M');
    expect(s.weeks).toBe('34');
    expect(s.days).toBe('2');
    expect(s.weight).toBe('1850');
    expect(s.length).toBe('43');
    expect(s.head).toBe('31');
  });

  it('oznacza pochodzenie, żeby dało się je odróżnić od stanu karty', () => {
    expect(P.naKarte(PERINATAL, 'M').zKartyPacjenta).toBe(true);
  });

  it('nie wymyśla norm urodzeniowych — Karta Pacjenta o nie nie pyta', () => {
    // Gdyby adapter podstawił tu jakikolwiek klucz, ściąga i opis twierdziłyby, że
    // lekarz wybrał normy, których nigdy nie widział.
    expect(P.naKarte(PERINATAL, 'M').sourceKeys).toBeUndefined();
  });

  it('płeć sprowadza do kształtu, który rozumie silnik karty', () => {
    expect(P.naKarte(PERINATAL, 'K').sex).toBe('female');
    expect(P.naKarte(PERINATAL, 'F').sex).toBe('female');
    expect(P.naKarte(PERINATAL, 'female').sex).toBe('female');
    expect(P.naKarte(PERINATAL, 'M').sex).toBe('male');
    expect(P.naKarte(PERINATAL, 'male').sex).toBe('male');
  });

  it('brak płci zostaje brakiem — adapter nie zgaduje chłopca', () => {
    expect(P.naKarte(PERINATAL, null).sex).toBe('');
    expect(P.naKarte(PERINATAL, 'nieznana').sex).toBe('');
  });

  it('liczby zamienia na tekst i przycina spacje', () => {
    const s = P.naKarte({ gestationalWeeks: 34, birthWeightG: ' 1850 ' }, 'M');
    expect(s.weeks).toBe('34');
    expect(s.weight).toBe('1850');
  });

  it('kontrola negatywna: sekcja bez pomiarów to nie są dane urodzeniowe', () => {
    expect(P.naKarte(null, 'M')).toBeNull();
    expect(P.naKarte({}, 'M')).toBeNull();
    expect(P.naKarte({ gravidity: '2', parity: '2' }, 'M')).toBeNull();
    // Same dni bez tygodni nie pozwalają policzyć niczego.
    expect(P.naKarte({ gestationalDays: '3' }, 'M')).toBeNull();
  });
});

describe('Pierwszeństwo źródeł', () => {
  const KARTA = { sex: 'male', weeks: '36', days: '0', weight: '2100', length: '45', head: '32' };
  const REKORD = { sex: 'male', weeks: '35', days: '0', weight: '2000', length: '44', head: '31' };
  const KP = P0 => P0.naKarte(PERINATAL, 'M');

  it('karta SGA wygrywa — jest najświeższa i jako jedyna niesie wybór norm', () => {
    const w = P.wybierz({ karta: KARTA, rekord: REKORD, kartaPacjenta: KP(P) });
    expect(w.weight).toBe('2100');
  });

  it('pusta karta nie przykrywa wartości przeniesionej z rekordu', () => {
    const pusta = { sex: 'male', weeks: '', days: '', weight: '', length: '', head: '' };
    const w = P.wybierz({ karta: pusta, rekord: REKORD, kartaPacjenta: KP(P) });
    expect(w.weight).toBe('2000');
  });

  it('gdy karty i sekcji `birth` nie ma, zostaje Karta Pacjenta', () => {
    const w = P.wybierz({ karta: null, rekord: null, kartaPacjenta: KP(P) });
    expect(w.weight).toBe('1850');
    expect(w.zKartyPacjenta).toBe(true);
  });

  it('index.html: karty SGA nie ma wcale, a dane i tak są', () => {
    const w = P.wybierz({ kartaPacjenta: KP(P) });
    expect(w.weeks).toBe('34');
  });

  it('kontrola negatywna: bez żadnego źródła nie ma danych urodzeniowych', () => {
    expect(P.wybierz({})).toBeNull();
    expect(P.wybierz(null)).toBeNull();
    expect(P.wybierz({ karta: {}, rekord: {}, kartaPacjenta: null })).toBeNull();
  });
});

describe('Pamięć sekcji z wczytanego rekordu', () => {
  it('bierze `perinatal` z payloadu i płeć z sekcji `user`', () => {
    const okno = {};
    new Function('window', zrodlo('vilda_perinatal_source.js'))(okno);
    const S = okno.VildaPerinatalSource;
    S.zapamietaj({ perinatal: PERINATAL, user: { sex: 'K' } });
    expect(S.zKartyPacjenta().weight).toBe('1850');
    expect(S.zKartyPacjenta().sex).toBe('female');
  });

  it('rekord bez sekcji okołoporodowej kasuje poprzednią pamięć', () => {
    const okno = {};
    new Function('window', zrodlo('vilda_perinatal_source.js'))(okno);
    const S = okno.VildaPerinatalSource;
    S.zapamietaj({ perinatal: PERINATAL, user: { sex: 'M' } });
    S.zapamietaj({ user: { sex: 'M' } });
    expect(S.zKartyPacjenta()).toBeNull();
  });

  it('wylogowanie: zapomnij() czyści sekcję', () => {
    const okno = {};
    new Function('window', zrodlo('vilda_perinatal_source.js'))(okno);
    const S = okno.VildaPerinatalSource;
    S.zapamietaj({ perinatal: PERINATAL, user: { sex: 'M' } });
    S.zapomnij();
    expect(S.zKartyPacjenta()).toBeNull();
  });

  it('biezace() składa trzy źródła z globali okna', () => {
    const okno = {
      vildaBirthData: null,
      vildaSgaBirthPersistApi: { captureState: () => ({ weeks: '', weight: '' }) },
    };
    new Function('window', zrodlo('vilda_perinatal_source.js'))(okno);
    const S = okno.VildaPerinatalSource;
    S.zapamietaj({ perinatal: PERINATAL, user: { sex: 'M' } });
    expect(S.biezace().weight).toBe('1850');
    okno.vildaBirthData = { weeks: '35', weight: '2000' };
    expect(S.biezace().weight).toBe('2000');
  });

  it('karta, która rzuca przy odczycie, nie wywraca odczytu pozostałych źródeł', () => {
    const okno = {
      vildaSgaBirthPersistApi: { captureState: () => { throw new Error('karty nie ma'); } },
    };
    new Function('window', zrodlo('vilda_perinatal_source.js'))(okno);
    const S = okno.VildaPerinatalSource;
    S.zapamietaj({ perinatal: PERINATAL, user: { sex: 'M' } });
    expect(S.biezace().weight).toBe('1850');
  });
});

// ── Wpięcie: opis pacjenta ────────────────────────────────────────────────────
//
// Silnik SDS urodzeniowego jest tu podstawiony, bo sprawdzamy INSTALACJĘ (czy dane
// dopłynęły i z jaką płcią), a nie wzór — ten ma własne testy w module karty SGA.

function oknoOpisu({ perinatal, plecRekordu, karta, rekord, model }) {
  const wywolania = [];
  const okno = {
    advancedGrowthTrajectory: model,
    advancedGrowthData: {},
    vildaBirthData: rekord || null,
    VildaSgaBirth: {
      compute(klucz, arg) {
        wywolania.push({ klucz, ...arg });
        return { sourceKey: klucz, sourceShortLabel: 'Niklasson', weightSds: -2.4, lengthSds: -1.8 };
      },
    },
  };
  if (karta) okno.vildaSgaBirthPersistApi = { captureState: () => karta };
  new Function('window', zrodlo('vilda_perinatal_source.js'))(okno);
  new Function('window', zrodlo('vilda_sga_catchup.js'))(okno);
  new Function('window', zrodlo('vilda_patient_narrative_ui.js'))(okno);
  if (perinatal) {
    okno.VildaPerinatalSource.zapamietaj({ perinatal, user: { sex: plecRekordu } });
  }
  return { okno, wywolania, UI: okno.VildaPatientNarrativeUI };
}

// Donoszony noworodek SGA — do oceny catch-upu, żeby test nie zależał od bramki
// wcześniactwa (PERINATAL to 34 tc, więc konsensus każe czekać do 4 r.ż.).
const PERINATAL_DONOSZONY = {
  gestationalWeeks: '39',
  gestationalDays: '0',
  birthWeightG: '2400',
  birthLengthCm: '46',
  birthHeadCircCm: '32',
};

// 40 miesięcy, wzrost −2,4 SD — pasmo 3–4 lat konsensusu 2023, próg −2,0 SD.
const MODEL_40M = {
  sex: 'M',
  source: 'PALCZEWSKA',
  metrics: [{ metric: 'height', last: { value: 89, sd: -2.4, c: 0.8, ageMonths: 40 } }],
};

describe('Opis pacjenta czyta „Dane okołoporodowe"', () => {
  it('pacjent z danymi wyłącznie w Karcie Pacjenta dostaje ocenę catch-upu', () => {
    const { UI } = oknoOpisu({
      perinatal: PERINATAL_DONOSZONY, plecRekordu: 'M', model: MODEL_40M,
    });
    const c = UI.buildInput({}, MODEL_40M).sgaCatchUp;
    expect(c).not.toBeNull();
    expect(c.kryteriumSga).toBe('masa');
    expect(c.ponizejProgu).toBe(true);
    expect(c.prog).toBe(-2);
    expect(c.pasmo).toBe('3-4lata');
  });

  it('dziewczynka z Karty Pacjenta dostaje normy żeńskie', () => {
    // Bez łańcucha płci silnik dostałby wartość pustą i po cichu policzył chłopca.
    const { UI, wywolania } = oknoOpisu({
      perinatal: PERINATAL, plecRekordu: 'K', model: { ...MODEL_40M, sex: 'F' },
    });
    UI.buildInput({}, { ...MODEL_40M, sex: 'F' });
    expect(wywolania).toHaveLength(1);
    expect(wywolania[0].sex).toBe('female');
    expect(wywolania[0].weeks).toBe('34');
    expect(wywolania[0].weightG).toBe('1850');
  });

  it('gdy rekord nie zna płci, bierze ją z modelu karty wzrostowej', () => {
    const { UI, wywolania } = oknoOpisu({
      perinatal: PERINATAL, plecRekordu: null, model: { ...MODEL_40M, sex: 'F' },
    });
    UI.buildInput({}, { ...MODEL_40M, sex: 'F' });
    expect(wywolania[0].sex).toBe('female');
  });

  it('kontrola negatywna: wypełniona karta SGA nadal wygrywa z Kartą Pacjenta', () => {
    const karta = {
      sourceKeys: ['intergrowth'], sex: 'male',
      weeks: '36', days: '0', weight: '2100', length: '45', head: '32',
    };
    const { UI, wywolania } = oknoOpisu({
      perinatal: PERINATAL, plecRekordu: 'M', karta, model: MODEL_40M,
    });
    UI.buildInput({}, MODEL_40M);
    expect(wywolania[0].klucz).toBe('intergrowth');
    expect(wywolania[0].weightG).toBe('2100');
  });

  it('kontrola negatywna: bez danych urodzeniowych nigdzie zdanie nie powstaje', () => {
    const { UI } = oknoOpisu({ model: MODEL_40M });
    expect(UI.buildInput({}, MODEL_40M).sgaCatchUp).toBeNull();
  });
});

// ── Wpięcie: ściąga B.64 ──────────────────────────────────────────────────────

function oknoSciagi({ perinatal, plecRekordu, model }) {
  const wywolania = [];
  const okno = {
    advancedGrowthTrajectory: model,
    advancedGrowthData: { boneAgeMonths: 54 },
    VildaSgaBirth: {
      compute(klucz, arg) {
        wywolania.push({ klucz, ...arg });
        return { sourceKey: klucz, sourceShortLabel: 'Niklasson', weightSds: -2.4, lengthSds: -1.8 };
      },
    },
  };
  new Function('window', zrodlo('vilda_perinatal_source.js'))(okno);
  new Function('window', zrodlo('vilda_b64_checklist_ui.js'))(okno);
  if (perinatal) {
    okno.VildaPerinatalSource.zapamietaj({ perinatal, user: { sex: plecRekordu } });
  }
  return { okno, wywolania, UI: okno.VildaB64ChecklistUI };
}

describe('Ściąga B.64 czyta „Dane okołoporodowe"', () => {
  it('składa sekcję urodzeniową, choć karta SGA nigdy nie była wypełniona', () => {
    const { UI } = oknoSciagi({ perinatal: PERINATAL, plecRekordu: 'M', model: MODEL_40M });
    const u = UI.zbierz().urodzenie;
    expect(u.tygodnie).toBe(34);
    expect(u.dni).toBe(2);
    expect(u.masaSds).toBe(-2.4);
    expect(u.zrodloNorm).toBe('Niklasson');
  });

  it('bez wyboru norm w rekordzie zostaje wartość domyślna modułu', () => {
    const { UI, wywolania } = oknoSciagi({ perinatal: PERINATAL, plecRekordu: 'M', model: MODEL_40M });
    UI.zbierz();
    expect(wywolania[0].klucz).toBe('niklasson');
  });

  it('płeć zapasowa z modelu trafia do silnika, gdy rekord jej nie niesie', () => {
    const { UI, wywolania } = oknoSciagi({
      perinatal: PERINATAL, plecRekordu: null, model: { ...MODEL_40M, sex: 'F' },
    });
    UI.zbierz();
    expect(wywolania[0].sex).toBe('female');
  });

  it('kontrola negatywna: bez danych okołoporodowych sekcja pozostaje pusta', () => {
    const { UI } = oknoSciagi({ model: MODEL_40M });
    expect(UI.zbierz().urodzenie).toBeNull();
  });
});
