// P-GH-PUNKTY-TESTY: złota siatka punktów terapii GH. Generator i sprawdzian wzorca tests/fixtures/gh-punkty-wzorzec.json.
// Wzorzec liczy PRAWDZIWY monitor gh_therapy_monitor.js z commitu BAZA (origin/audyt przed przeniesieniem reguł punktów
// do wspólnego API), w atrapie tests/support/gh-monitor-atrapa.mjs, razem z vilda_html.js, wiekiem kostnym i modułem
// dawki z tego samego commitu. Wzorzec nie jest przepisanym wzorem, tylko zapisem dzisiejszego zachowania: ścieżek
// Z1 (nowy punkt z karty), Z2 (edycja punktu z listy), Z4 (punkt wsteczny) i Z5 (usuwanie).
//
// ZMIANA WZORCA = ZMIANA ZACHOWANIA PUNKTÓW GH. Wymaga uzasadnienia w PR, a przy zmianie dawki, jednostki albo wyniku
// także akceptacji klinicznej właściciela (AGENTS.md §3). Nie wolno regenerować wzorca po to, żeby test
// tests/unit/gh-punkty-siatka.test.mjs znów przeszedł: najpierw ustal, który przypadek się zmienił i dlaczego.
//   node tests/scripts/gh-punkty-wzorzec.mjs            → sprawdza, że wzorzec = wynik monitora z commitu BAZA
//   node tests/scripts/gh-punkty-wzorzec.mjs --zapisz   → zapisuje wzorzec od nowa (tylko z uzasadnieniem w PR)
//   node tests/scripts/gh-punkty-wzorzec.mjs --roznice  → wypisuje przypadki, w których drzewo robocze różni się od BAZA
// P-GH-DAWKA-BEZ-MODULU (D6, decyzja właściciela 2026-10-07): bez modułu dawki monitor nie zapisuje (prosi o odświeżenie
// strony), więc przypadki z modulDawki: false opisują we wzorcu zachowanie sprzed D6. Pole kategorieZModulemDawki to
// skróty tych samych kategorii policzone tylko z przypadków z modułem dawki (ten sam przebieg monitora z BAZA); test
// porównuje z nim drzewo robocze, a przypadki bez modułu sprawdza jako odmowy. `--roznice` pokazuje też te odmowy.
// Siatkę, wykonanie przypadku i postać kanoniczną wyniku eksportuje ten plik. Test używa tych samych funkcji, ale na
// plikach z drzewa roboczego. Dane wyłącznie FIKCYJNE.
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { LOSOWA, ZEGAR_KROK, ZEGAR_START, utworzAtrapeMonitoraGh } from '../support/gh-monitor-atrapa.mjs';

export const korzen = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
export const PLIK_WZORCA = 'tests/fixtures/gh-punkty-wzorzec.json';
// Commit, z którego generator liczy wzorzec. Zmiana BAZA to zmiana punktu odniesienia: tylko z uzasadnieniem.
export const BAZA = '3855858';
// Pliki produkcyjne, które atrapa wykonuje (kolejność jak w docpro.html).
export const PLIKI = ['vilda_html.js', 'vilda_bone_age.js', 'vilda_gh_opakowania_dane.js', 'vilda_gh_dawka_dane.js',
  'vilda_gh_dawka.js', 'gh_therapy_monitor.js'];

/* ---------- Wymiary siatki ---------- */

// Preparaty: 7 z listy monitora, nieznany, „ngenla 60 mg” małą literą (VildaGhDawka go nie zna, a /^Ngenla/ przy
// zapisie rozróżnia wielkość liter) oraz pusty (tylko w odmowach). Program: ten, z którym preparat występuje w karcie.
// Dawki podawane (Omnitrope i Genotropin mg/dobę, Ngenla mg/tydzień, Increlex mg na podanie): na kroku wstrzykiwacza,
// poza krokiem i ułamek z kilkoma cyframi po przecinku. „karta” mówi, jak atrapa wyniku karty liczy perDayMg/perWeekMg.
export const PREPARATY = [
  { drug: 'Omnitrope 5 mg', program: 'SNP', karta: 'dobowy', dawki: ['0.85', '0.87', '0.4321'] },
  { drug: 'Omnitrope 10 mg', program: 'ZT', karta: 'dobowy', dawki: ['1.2', '1.25', '0.7777'] },
  { drug: 'Genotropin 5,3 mg', program: 'PWS', karta: 'dobowy', dawki: ['0.95', '0.97', '0.6123'] },
  { drug: 'Genotropin 12 mg', program: 'SGA', karta: 'dobowy', dawki: ['1.05', '1.1', '0.8333'] },
  { drug: 'Ngenla 24 mg', program: 'PNN', karta: 'tygodniowy', dawki: ['8.4', '8.5', '7.3333'] },
  { drug: 'Ngenla 60 mg', program: 'SNP', karta: 'tygodniowy', dawki: ['21', '21.3', '16.6667'] },
  { drug: 'Increlex 40 mg', program: 'IGF-1', karta: 'naPodanie', dawki: ['1.3', '1.35', '0.8333'] },
  { drug: 'Preparat fikcyjny 4 mg', program: 'SNP', karta: 'dobowy', dawki: ['1.1', '1.13', '0.5555'] },
  { drug: 'ngenla 60 mg', program: 'SNP', karta: 'tygodniowy', dawki: ['21', '21.3', '16.6667'] },
];
const PUSTY = { drug: '', program: 'SNP', karta: 'dobowy', dawki: ['1.2'] };

// Masy niebędące potęgą dwójki (27,3; 33,7; 41,9) ujawniają zmianę kolejności działań w ostatnim bicie wyniku.
export const MASY = ['32', '27.3', '33.7', '41.9'];
export const MASY_ZLE = ['0', '-1', 'x'];
// [lata, miesiące] tak, jak je wpisano. Pole liczbowe przyjmuje tylko liczbę HTML, więc „x” daje pusty tekst.
export const WIEKI = [['10', '14'], ['9', '11'], ['10.5', '3'], ['7', '2.6'], ['12.25', ''], ['10', 'x'], ['0', '5'],
  ['11', '-3']];
export const WIEKI_ZLE = [['0', '0'], ['x', '4'], ['-1', '6']];
export const WZROSTY = ['141', '133.4'];
export const WZROSTY_ZLE = ['0', 'x'];
export const DAWKI_ZLE = ['0', '-1', 'x'];
// [IGF-1 ng/mL, dni od dawki] dla edycji i punktu wstecznego (nowy punkt z karty nie ma pól IGF).
export const IGF = [['', ''], ['250', ''], ['250', '3'], ['187.4', '0.5'], ['', '2']];
export const KOSCI_KARTY = ['', '9.5', '25'];
export const KOSCI = ['', '9.5', '25', '0'];
// Pole karty #therDailyDose (mg/kg; puste i „0” biorą placeholder 0,025) i #therDailyDoseAbs (pusty albo dawka podawana).
export const DAWKI_KARTY = ['', '0.0333', '0.66'];
export const WYNIK_KARTY = ['zgodna', 'niezgodna', 'brak'];

// Fikcyjne punkty w kształcie zapisu monitora (15 kluczy) i w kształtach spotykanych w danych: bez id, z obcym polem
// w środku rekordu, w dawnym formacie (Ngenla bez doseAbs, ułamkowy wiek bez ageMonths), z tym samym id dwa razy,
// z id liczbowym.
const pkt = (id, type, reszta) => ({
  ...(id === undefined ? {} : { id }), type, ageYears: 9, ageMonths: 0, weight: 30, height: 132, boneAge: null,
  dose: 0.025, doseUnit: 'mg/kg/d', drug: 'Omnitrope 10 mg', program: 'SNP', igf1: null, igf1Unit: 'ng/mL',
  igf1DaysSinceDose: null, doseAbs: 0.75, ...reszta,
});
const WLACZENIE = pkt('fikc-w1', 'start', {
  ageYears: 8, ageMonths: 6, weight: 26, height: 127, boneAge: 7.5, doseAbs: 0.65, igf1: 180,
});
const ZAKONCZENIE = pkt('fikc-z1', 'end', {
  ageYears: 13, ageMonths: 2, weight: 44, height: 158, dose: 0.0236, drug: 'Genotropin 12 mg', doseAbs: 1.05,
});
const BEZ_ID = pkt(undefined, 'continue', {
  ageYears: 9, ageMonths: 6, weight: 29.5, height: 133, dose: 0.6, doseUnit: 'mg/kg/tydz', drug: 'Ngenla 60 mg',
  program: 'ZT', doseAbs: 2.5,
});
const OBCE_POLE = (() => {
  const { id, type, ...reszta } = pkt('fikc-k2', 'continue', {
    ageYears: 10, ageMonths: 1, weight: 31, height: 138, dose: 0.08, drug: 'Increlex 40 mg', program: 'IGF-1',
    igf1: 95.5, igf1DaysSinceDose: 2, doseAbs: 2.48,
  });
  return { id, type, zrodloFikcyjne: 'pole spoza schematu', ...reszta };
})();
const DAWNY = {
  id: 'fikc-dawny', type: 'continue', ageYears: 9.5, weight: 30, height: 135, dose: 0.66, doseUnit: 'mg/kg/tydz',
  drug: 'Ngenla 24 mg', program: 'SNP',
};
export const LISTY = {
  pusta: [],
  W: [WLACZENIE],
  'W+Z': [WLACZENIE, ZAKONCZENIE],
  'W+bez-id': [WLACZENIE, BEZ_ID],
  'W+obce-pole': [WLACZENIE, OBCE_POLE],
  'dawny-format': [DAWNY],
  duplikat: [
    WLACZENIE, pkt('fikc-dup', 'continue', { ageYears: 10 }), pkt('fikc-dup', 'continue', { ageYears: 11, weight: 35 }),
  ],
  'dwa-bez-id': [WLACZENIE, BEZ_ID, pkt(undefined, 'continue', { ageYears: 10, weight: 33 })],
  'id-liczbowe': [WLACZENIE, pkt(1767000000123.5, 'continue', { ageYears: 10, weight: 32 })],
};
const LISTY_ZAPISU = ['pusta', 'W', 'W+Z', 'W+bez-id', 'W+obce-pole', 'dawny-format'];
const LISTY_USUWANIA = ['W', 'W+Z', 'W+bez-id', 'W+obce-pole', 'dawny-format', 'duplikat', 'dwa-bez-id', 'id-liczbowe'];

// Kategorie w kolejności siatki. Odmowy są osobną, mniejszą podsiatką.
export const KATEGORIE = ['Z1-modul', 'Z1-bez-modulu', 'Z2-modul', 'Z2-bez-modulu', 'Z4-modul', 'Z4-bez-modulu', 'Z5',
  'Z1-odmowy', 'Z2-odmowy', 'Z4-odmowy'];
export const KATEGORIE_ODMOW = ['Z1-odmowy', 'Z2-odmowy', 'Z4-odmowy'];

/* ---------- Budowa siatki ---------- */

// Deterministyczny wybór wymiarów pobocznych (lista, typ, wiek, wzrost, wiek kostny) z numeru przypadku: skrót
// całkowitoliczbowy zamiast i % n, żeby wymiary poboczne nie sprzęgały się z pętlami wymiarów głównych.
function mieszaj(i, sol) {
  let h = Math.imul(i + 1, 0x9e3779b1) ^ Math.imul(sol + 1, 0x85ebca6b);
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
}
const wybierz = (tablica, i, sol) => tablica[mieszaj(i, sol) % tablica.length];

const TYPY = ['start', 'continue', 'end'];
const idTekst = (punkt) => String(punkt.id);
const jestTypInny = (lista, typ, pomin) => LISTY[lista].some((p) => p.type === typ && idTekst(p) !== pomin);
// Typy, z którymi zapis jest możliwy: Włączenie i Zakończenie najwyżej raz na liście (przy edycji poza edytowanym).
const typyDozwolone = (lista, cel = null) => TYPY.filter((t) => t === 'continue' || !jestTypInny(lista, t, cel));
const typyZajete = (lista, cel = null) => TYPY.filter((t) => !typyDozwolone(lista, cel).includes(t));
const celeListy = (lista) => [...new Set(LISTY[lista].map(idTekst))];

// Wynik karty (window.ghTherapyCalc) podaje siatka, bo atrapa nie ładuje karty: dawka podawana z kroku wstrzykiwacza
// przeliczona na mg/dobę i mg/tydzień tak, jak robi to karta; masa zgodna z polem albo inna o 0,5 kg.
function wynikKarty(prep, masa, dawka, rodzaj) {
  if (rodzaj === 'brak') return null;
  const d = Number(dawka);
  const naDobe = prep.karta === 'tygodniowy' ? d / 7 : prep.karta === 'naPodanie' ? 2 * d : d;
  const naTydzien = prep.karta === 'tygodniowy' ? d : naDobe * 7;
  const weight = Number(masa) + (rodzaj === 'niezgodna' ? 0.5 : 0);
  return { drug: prep.drug, weight, perDayMg: naDobe, perWeekMg: naTydzien };
}

function polaKarty(prep, lista, { wiek, masa, wzrost, kosc, dawkaKarty, dawkaAbs, program }) {
  return {
    age: wiek[0], ageMonths: wiek[1], weight: masa, height: wzrost, advBoneAge: kosc,
    // Przy niepustej liście F() monitora ustawia i blokuje #therProg programem punktu Włączenia; program wpisujemy
    // tylko przy pustej liście, tak jak może to zrobić lekarz.
    ...(lista === 'pusta' ? { therProg: program ?? prep.program } : {}),
    therDrug: prep.drug, therDailyDose: dawkaKarty, therDailyDoseAbs: dawkaAbs,
  };
}
const polaEdycji = (prep, { wiek, masa, wzrost, kosc, dawka, igf }) => ({
  ghEditDrug: prep.drug, ghEditAge: wiek[0], ghEditAgeMonths: wiek[1], ghEditWeight: masa, ghEditHeight: wzrost,
  ghEditBoneAge: kosc, ghEditDose: dawka, ghEditIgf1: igf[0], ghEditIgfDays: igf[1],
});
const polaWstecznego = (prep, typ, { wiek, masa, wzrost, kosc, dawka, igf, program }) => ({
  ghRetroType: typ, ghRetroProg: program ?? prep.program, ghRetroDrug: prep.drug, ghRetroAge: wiek[0],
  ghRetroAgeMonths: wiek[1], ghRetroWeight: masa, ghRetroHeight: wzrost, ghRetroBoneAge: kosc, ghRetroDose: dawka,
  ghRetroIgf1: igf[0], ghRetroIgfDays: igf[1],
});

/** Wszystkie przypadki siatki w stałej kolejności. Każdy przypadek to zwykły obiekt JSON. */
export function siatka() {
  const wynik = [];
  const liczniki = new Map();
  let i = 0;
  const dodaj = (kategoria, przypadek) => {
    const n = liczniki.get(kategoria) || 0;
    liczniki.set(kategoria, n + 1);
    wynik.push({ id: `${kategoria}-${String(n).padStart(5, '0')}`, kategoria, ...przypadek });
  };
  const modul = (m) => (m ? 'modul' : 'bez-modulu');

  // Z1: nowy punkt z karty. Pełny iloczyn preparatu, masy, dawki, wyniku karty i pól dawki; reszta pobocznie.
  for (const modulDawki of [true, false]) {
    for (const prep of PREPARATY) for (const masa of MASY) for (const dawka of prep.dawki) {
      for (const rodzaj of WYNIK_KARTY) for (const dawkaKarty of DAWKI_KARTY) for (const dawkaAbs of ['', dawka]) {
        i += 1;
        const lista = wybierz(LISTY_ZAPISU, i, 1);
        dodaj(`Z1-${modul(modulDawki)}`, {
          sciezka: 'Z1', modulDawki, lista, typ: wybierz(typyDozwolone(lista), i, 2),
          karta: wynikKarty(prep, masa, dawka, rodzaj),
          pola: polaKarty(prep, lista, {
            wiek: wybierz(WIEKI, i, 3), masa, wzrost: wybierz(WZROSTY, i, 4), kosc: wybierz(KOSCI_KARTY, i, 5),
            dawkaKarty, dawkaAbs,
          }),
        });
      }
    }
  }

  // Z2: edycja punktu z listy. Pełny iloczyn preparatu, masy, dawki podawanej i IGF; lista, punkt, typ i reszta
  // pobocznie, w dwóch obrotach. Dodatkowo edycja samej masy: dawka podawana zostaje ta, którą formularz odczytał
  // z punktu.
  const paryEdycji = LISTY_ZAPISU.filter((l) => l !== 'pusta').flatMap((l) => celeListy(l).map((cel) => [l, cel]));
  for (const modulDawki of [true, false]) {
    for (const prep of PREPARATY) for (const masa of MASY) for (const dawka of prep.dawki) for (const igf of IGF) {
      for (let obrot = 0; obrot < 2; obrot += 1) {
        i += 1;
        const [lista, cel] = wybierz(paryEdycji, i, 11);
        dodaj(`Z2-${modul(modulDawki)}`, {
          sciezka: 'Z2', modulDawki, lista, cel, typ: wybierz(typyDozwolone(lista, cel), i, 12),
          pola: polaEdycji(prep, {
            wiek: wybierz(WIEKI, i, 13), masa, wzrost: wybierz(WZROSTY, i, 14), kosc: wybierz(KOSCI, i, 15), dawka, igf,
          }),
        });
      }
    }
    for (const [lista, cel] of paryEdycji) for (const typ of typyDozwolone(lista, cel)) for (const masa of MASY) {
      dodaj(`Z2-${modul(modulDawki)}`, { sciezka: 'Z2', modulDawki, lista, cel, typ, pola: { ghEditWeight: masa } });
    }
  }

  // Z4: punkt wsteczny. Pełny iloczyn jak w Z2; lista, typ i reszta pobocznie, w trzech obrotach.
  for (const modulDawki of [true, false]) {
    for (const prep of PREPARATY) for (const masa of MASY) for (const dawka of prep.dawki) for (const igf of IGF) {
      for (let obrot = 0; obrot < 3; obrot += 1) {
        i += 1;
        const lista = wybierz(LISTY_ZAPISU, i, 21);
        const typ = wybierz(typyDozwolone(lista), i, 22);
        dodaj(`Z4-${modul(modulDawki)}`, {
          sciezka: 'Z4', modulDawki, lista,
          pola: polaWstecznego(prep, typ, {
            wiek: wybierz(WIEKI, i, 23), masa, wzrost: wybierz(WZROSTY, i, 24), kosc: wybierz(KOSCI, i, 25), dawka, igf,
          }),
        });
      }
    }
  }

  // Z5: usunięcie każdego id z listy (przycisk w wierszu i potwierdzenie albo „Anuluj” w nakładce).
  for (const lista of LISTY_USUWANIA) for (const cel of celeListy(lista)) {
    for (const modulDawki of [true, false]) for (const anuluj of [false, true]) {
      dodaj('Z5', { sciezka: 'Z5', modulDawki, lista, cel, anuluj });
    }
  }

  // Odmowy: zajęty typ, zła masa, wiek, wzrost albo dawka, pusty preparat albo program.
  const poprawne = (j) => ({
    wiek: wybierz(WIEKI, j, 31), masa: wybierz(MASY, j, 32), wzrost: wybierz(WZROSTY, j, 33),
    kosc: wybierz(KOSCI, j, 34), igf: wybierz(IGF, j, 35),
  });
  const bledy = (prep, j) => [
    ...MASY_ZLE.map((masa) => ['masa', { masa }]),
    ...WIEKI_ZLE.map((wiek) => ['wiek', { wiek }]),
    ...WZROSTY_ZLE.map((wzrost) => ['wzrost', { wzrost }]),
    ...DAWKI_ZLE.map((dawka) => ['dawka', { dawka }]),
  ].map(([powod, zmiana]) => [powod, { ...poprawne(j), dawka: wybierz(prep.dawki, j, 36), ...zmiana }]);
  const zajete = LISTY_ZAPISU.flatMap((l) => typyZajete(l).map((typ) => [l, typ]));

  for (const modulDawki of [true, false]) {
    for (const prep of [...PREPARATY, PUSTY]) {
      for (const [lista, typ] of zajete) {
        if (prep === PUSTY) continue;
        i += 1;
        const w = poprawne(i);
        dodaj('Z1-odmowy', {
          sciezka: 'Z1', modulDawki, powod: 'typ', lista, typ, karta: null,
          pola: polaKarty(prep, lista, { ...w, dawkaKarty: '', dawkaAbs: '' }),
        });
      }
      // Dawka karty nie bywa zła: puste albo zerowe #therDailyDose bierze placeholder.
      for (const [powod, w] of bledy(prep, i).filter(([p]) => p !== 'dawka')) {
        i += 1;
        const lista = wybierz(LISTY_ZAPISU, i, 37);
        dodaj('Z1-odmowy', {
          sciezka: 'Z1', modulDawki, powod, lista, typ: wybierz(typyDozwolone(lista), i, 38), karta: null,
          pola: polaKarty(prep, lista, { ...w, dawkaKarty: '', dawkaAbs: '' }),
        });
      }
      if (prep === PUSTY) {
        for (const masa of MASY) {
          i += 1;
          dodaj('Z1-odmowy', {
            sciezka: 'Z1', modulDawki, powod: 'preparat', lista: 'pusta', typ: 'continue', karta: null,
            pola: polaKarty(prep, 'pusta', { ...poprawne(i), masa, dawkaKarty: '', dawkaAbs: '' }),
          });
        }
      } else {
        i += 1;
        dodaj('Z1-odmowy', {
          sciezka: 'Z1', modulDawki, powod: 'program', lista: 'pusta', typ: 'continue', karta: null,
          pola: polaKarty(prep, 'pusta', { ...poprawne(i), dawkaKarty: '', dawkaAbs: '', program: '' }),
        });
      }

      for (const [lista, typ] of zajete) {
        if (prep === PUSTY) continue;
        i += 1;
        dodaj('Z4-odmowy', {
          sciezka: 'Z4', modulDawki, powod: 'typ', lista,
          pola: polaWstecznego(prep, typ, { ...poprawne(i), dawka: wybierz(prep.dawki, i, 39) }),
        });
      }
      for (const [powod, w] of bledy(prep, i)) {
        i += 1;
        const lista = wybierz(LISTY_ZAPISU, i, 40);
        dodaj('Z4-odmowy', {
          sciezka: 'Z4', modulDawki, powod, lista, pola: polaWstecznego(prep, wybierz(typyDozwolone(lista), i, 41), w),
        });
      }
      if (prep === PUSTY) {
        for (const masa of MASY) {
          i += 1;
          const lista = wybierz(LISTY_ZAPISU, i, 42);
          dodaj('Z4-odmowy', {
            sciezka: 'Z4', modulDawki, powod: 'preparat', lista,
            pola: polaWstecznego(prep, wybierz(typyDozwolone(lista), i, 43), { ...poprawne(i), masa, dawka: '1.2' }),
          });
        }
      } else {
        i += 1;
        const lista = wybierz(LISTY_ZAPISU, i, 44);
        dodaj('Z4-odmowy', {
          sciezka: 'Z4', modulDawki, powod: 'program', lista,
          pola: polaWstecznego(prep, wybierz(typyDozwolone(lista), i, 45), {
            ...poprawne(i), dawka: wybierz(prep.dawki, i, 46), program: '',
          }),
        });
      }
    }
  }

  // Odmowy edycji: każda na świeżej atrapie (po odmowie formularz edycji zostaje otwarty). Moduł dawki pobocznie.
  const zajeteEdycji = paryEdycji.flatMap(([l, cel]) => typyZajete(l, cel).map((typ) => [l, cel, typ]));
  for (const prep of [...PREPARATY, PUSTY]) {
    for (const [lista, cel, typ] of prep === PUSTY ? [] : zajeteEdycji) {
      i += 1;
      dodaj('Z2-odmowy', {
        sciezka: 'Z2', modulDawki: wybierz([true, false], i, 51), swieza: true, powod: 'typ', lista, cel, typ,
        pola: polaEdycji(prep, { ...poprawne(i), dawka: wybierz(prep.dawki, i, 52) }),
      });
    }
    const zmiany = prep === PUSTY ? MASY.map((masa) => ['preparat', { ...poprawne(i), masa, dawka: '1.2' }]) : bledy(prep, i);
    for (const [powod, w] of zmiany) {
      i += 1;
      const [lista, cel] = wybierz(paryEdycji, i, 53);
      dodaj('Z2-odmowy', {
        sciezka: 'Z2', modulDawki: wybierz([true, false], i, 54), swieza: true, powod, lista, cel,
        typ: wybierz(typyDozwolone(lista, cel), i, 55), pola: polaEdycji(prep, w),
      });
    }
  }

  const kolejnosc = new Map(KATEGORIE.map((k, n) => [k, n]));
  return wynik.sort((a, b) => kolejnosc.get(a.kategoria) - kolejnosc.get(b.kategoria));
}

/* ---------- Wynik kanoniczny ---------- */

// Nowe id nadaje monitor: String(Date.now() + Math.random()) na zegarze atrapy. Numer wywołania zegara zależy od tego,
// ile punktów dodano wcześniej na tej samej atrapie, więc w wyniku kanonicznym id o tej budowie zastępuje znacznik.
// Id innej budowy (np. inny generator) zostaje dosłownie i różni się od wzorca.
export const NOWE_ID = '#nowe-id: String(Date.now()+Math.random())';
function jestNoweId(v) {
  const n = Number(v);
  const krok = (n - LOSOWA - ZEGAR_START) / ZEGAR_KROK;
  return String(n) === v && Number.isInteger(krok) && krok >= 0;
}

// Postać JSON wyniku bez utraty informacji: liczby z rozróżnieniem NaN, -0 i nieskończoności (Object.is), undefined
// jako znacznik. JSON.stringify zachowuje kolejność kluczy i zapisuje liczbę najkrótszym zapisem, który ją odtwarza,
// więc równość tekstów oznacza równość co do bitu.
export function doJson(v, znaneId = new Set(), klucz = null) {
  if (typeof v === 'number') {
    if (Number.isNaN(v)) return { $liczba: 'NaN' };
    if (Object.is(v, -0)) return { $liczba: '-0' };
    if (!Number.isFinite(v)) return { $liczba: String(v) };
    return v;
  }
  if (v === undefined) return { $brak: true };
  if (klucz === 'id' && typeof v === 'string' && !znaneId.has(v) && jestNoweId(v)) return NOWE_ID;
  if (v === null || typeof v !== 'object') return v;
  if (Array.isArray(v)) return v.map((x) => doJson(x, znaneId));
  const o = {};
  for (const k of Object.keys(v)) o[k] = doJson(v[k], znaneId, k);
  return o;
}
export const kanon = (wynikJson) => JSON.stringify(wynikJson);
/** Pierwsze miejsce, w którym dwa wyniki JSON się różnią (wartość albo kolejność kluczy), albo null. */
export function pierwszaRoznica(a, b, sciezka = 'wynik') {
  if (JSON.stringify(a) === JSON.stringify(b)) return null;
  if (a && b && typeof a === 'object' && typeof b === 'object' && Array.isArray(a) === Array.isArray(b)) {
    const ka = Object.keys(a);
    const kb = Object.keys(b);
    if (ka.join() !== kb.join()) return `${sciezka}: klucze [${ka}] ≠ [${kb}]`;
    for (const k of ka) {
      const r = pierwszaRoznica(a[k], b[k], `${sciezka}.${k}`);
      if (r) return r;
    }
  }
  return `${sciezka}: ${JSON.stringify(a)} ≠ ${JSON.stringify(b)}`;
}
// Zapis = przypadek, w którym monitor zapisał moduł (wpis M). Bez zapisu kończą się odmowy i „Anuluj” przy usuwaniu.
export const zapisal = (wynikJson) => wynikJson.dziennik.some((w) => w.rodzaj === 'M');

/* ---------- Wykonanie przypadków ---------- */

const kopia = (v) => JSON.parse(JSON.stringify(v));
function ustawWynikKarty(win, karta) {
  if (karta) win.ghTherapyCalc = { ...karta };
  else delete win.ghTherapyCalc;
}
function krok(atrapa, p) {
  if (p.sciezka === 'Z1') atrapa.dodajZKarty(p.typ, p.pola);
  else if (p.sciezka === 'Z2') atrapa.edytuj(p.cel, p.pola, p.typ);
  else if (p.sciezka === 'Z4') atrapa.dodajWsteczny(p.pola);
  else if (p.sciezka === 'Z5') atrapa.usun(p.cel, { anuluj: p.anuluj });
  else throw new Error(`nieznana ścieżka ${p.sciezka}`);
}
function zbierz(atrapa, p, powiadomieniaOd) {
  const s = atrapa.stan();
  const znaneId = new Set(LISTY[p.lista].filter((x) => 'id' in x).map(idTekst));
  return doJson({
    lista: s.okno,
    modul: s.modul,
    dziennik: s.dziennik,
    komunikat: s.komunikat,
    edycjaWidoczna: s.edycjaWidoczna,
    wstecznyWidoczny: s.wstecznyWidoczny,
    powiadomienia: s.powiadomienia.slice(powiadomieniaOd),
  }, znaneId);
}

/**
 * Jeden przypadek na świeżej atrapie (lista w pamięci modułu przed startem monitora). opcjeAtrapy trafiają do
 * utworzAtrapeMonitoraGh, np. { modulPunktow: false } dla monitora sprzed API podanego w `zrodla` (opcjePrzedApi w atrapie).
 */
export function wykonajNaSwiezej(p, zrodla = {}, opcjeAtrapy = {}) {
  const atrapa = utworzAtrapeMonitoraGh({
    ...opcjeAtrapy, modulDawki: p.modulDawki, punkty: kopia(LISTY[p.lista]), zrodla,
    ...(p.karta ? { ghTherapyCalc: { ...p.karta } } : {}),
  });
  krok(atrapa, p);
  return zbierz(atrapa, p, 0);
}

/**
 * Przypadki na atrapie użytej ponownie (osobnej dla wariantu z modułem dawki i bez). Przed każdym przypadkiem: zamknięcie
 * komunikatu i formularza wstecznego, lista w pamięci modułu, odświeżenie monitora (D() i F(), jak po zdarzeniu storage),
 * wyzerowanie wieku kostnego i wyniku karty. Przypadki ze znacznikiem `swieza` idą na świeżą atrapę.
 * @returns {Map<string, object>} id przypadku → wynik w postaci JSON
 */
export function wykonajPrzypadki(przypadki, zrodla = {}, opcjeAtrapy = {}) {
  const atrapy = new Map();
  const wyniki = new Map();
  for (const p of przypadki) {
    if (p.swieza) {
      wyniki.set(p.id, wykonajNaSwiezej(p, zrodla, opcjeAtrapy));
      continue;
    }
    if (!atrapy.has(p.modulDawki)) {
      atrapy.set(p.modulDawki, {
        atrapa: utworzAtrapeMonitoraGh({ ...opcjeAtrapy, modulDawki: p.modulDawki, zrodla }), powiadomienia: 0,
      });
    }
    const uzyta = atrapy.get(p.modulDawki);
    const { atrapa } = uzyta;
    atrapa.zamknijKomunikat();
    atrapa.win.ghCancelRetroForm();
    atrapa.ustawModul(kopia(LISTY[p.lista]));
    atrapa.win.refreshGHTherapyMonitor();
    if (atrapa.win.VildaBoneAge) atrapa.win.VildaBoneAge.clear();
    ustawWynikKarty(atrapa.win, p.karta);
    atrapa.wyczyscDziennik();
    krok(atrapa, p);
    // Przygotowanie przypadku nie powiadamia wskaźnika zapisu, więc nowe powiadomienia liczymy od końca poprzedniego.
    const w = zbierz(atrapa, p, uzyta.powiadomienia);
    uzyta.powiadomienia += w.powiadomienia.length;
    // Atrapa użyta ponownie przyjmuje tylko edycje zakończone zapisem: po odmowie edycja zostaje otwarta.
    if (p.sciezka === 'Z2' && w.komunikat !== null) {
      throw new Error(`${p.id}: edycja na atrapie użytej ponownie zakończyła się odmową („${w.komunikat}”)`);
    }
    wyniki.set(p.id, w);
  }
  return wyniki;
}

/* ---------- Wzorzec ---------- */

/** Skrót SHA-256 kategorii: id, wejście i wynik kanoniczny każdego przypadku, w kolejności siatki. */
export function podsumowanieKategorii(przypadki, wyniki) {
  const wynik = {};
  for (const kategoria of KATEGORIE) {
    const hasz = createHash('sha256');
    let liczba = 0;
    let zapisy = 0;
    for (const p of przypadki) {
      if (p.kategoria !== kategoria) continue;
      const w = wyniki.get(p.id);
      if (!w) throw new Error(`brak wyniku przypadku ${p.id}`);
      hasz.update(`${p.id}\n${JSON.stringify(p)}\n${kanon(w)}\n`);
      liczba += 1;
      if (zapisal(w)) zapisy += 1;
    }
    wynik[kategoria] = { przypadki: liczba, zapisy, bezZapisu: liczba - zapisy, sha256: hasz.digest('hex') };
  }
  return wynik;
}

// Przypadki reprezentatywne (pełny wynik w czytelnym wzorcu): po jednym z każdej grupy, wybranym skrótem z klucza grupy.
// Grupy: Z1 preparat × wynik karty, Z2 i Z4 preparat × obecność IGF (edycja samej masy: lista), Z5 lista × „Anuluj”,
// odmowy powód × moduł dawki.
const kluczGrupy = (p) => {
  if (p.sciezka === 'Z5') return [p.kategoria, p.lista, p.anuluj].join('|');
  if (p.powod) return [p.kategoria, p.powod, p.modulDawki].join('|');
  const drug = p.pola.therDrug ?? p.pola.ghEditDrug ?? p.pola.ghRetroDrug ?? '(z punktu)';
  if (p.sciezka === 'Z1') {
    const karta = !p.karta ? 'brak' : p.karta.weight === Number(p.pola.weight) ? 'zgodna' : 'niezgodna';
    return [p.kategoria, drug, karta].join('|');
  }
  if (drug === '(z punktu)') return [p.kategoria, drug, p.lista].join('|');
  return [p.kategoria, drug, (p.pola.ghEditIgf1 ?? p.pola.ghRetroIgf1) === '' ? 'bez IGF' : 'IGF'].join('|');
};
export function idReprezentatywnych(przypadki) {
  const grupy = new Map();
  for (const p of przypadki) {
    const k = kluczGrupy(p);
    if (!grupy.has(k)) grupy.set(k, []);
    grupy.get(k).push(p.id);
  }
  const wybrane = new Set();
  for (const [k, ids] of grupy) {
    let h = 0;
    for (const z of k) h = Math.imul(h ^ z.charCodeAt(0), 0x01000193) >>> 0;
    wybrane.add(ids[h % ids.length]);
  }
  return przypadki.filter((p) => wybrane.has(p.id)).map((p) => p.id);
}

/** Pełny wzorzec liczony z podanych źródeł (domyślnie: commit BAZA). */
export function zbudujWzorzec(zrodla = zrodlaBazy()) {
  const przypadki = siatka();
  const wyniki = wykonajPrzypadki(przypadki, zrodla);
  const reprezentatywne = new Set(idReprezentatywnych(przypadki));
  return {
    opis: [
      'P-GH-PUNKTY-TESTY: złota siatka punktów terapii GH (Z1 nowy z karty, Z2 edycja punktu z listy, Z4 wsteczny, Z5 usuwanie).',
      'Wynik PRAWDZIWEGO gh_therapy_monitor.js z commitu „baza” w atrapie tests/support/gh-monitor-atrapa.mjs.',
      'Zmiana wzorca = zmiana zachowania punktów GH: tylko z uzasadnieniem w PR, nigdy po to, żeby test przeszedł.',
      'Generator: node tests/scripts/gh-punkty-wzorzec.mjs (--zapisz). Test: tests/unit/gh-punkty-siatka.test.mjs.',
      'Liczby: {"$liczba":"NaN"|"-0"|"Infinity"}, undefined: {"$brak":true}; id nadane przez monitor: znacznik #nowe-id.',
    ],
    baza: BAZA,
    pliki: PLIKI,
    listy: LISTY,
    kategorie: podsumowanieKategorii(przypadki, wyniki),
    kategorieZModulemDawki: podsumowanieKategorii(przypadki.filter((p) => p.modulDawki), wyniki),
    przypadki: przypadki.filter((p) => reprezentatywne.has(p.id)).map((p) => ({ wejscie: p, wynik: wyniki.get(p.id) })),
  };
}

export function zrodlaBazy(baza = BAZA) {
  const zrodla = {};
  for (const plik of PLIKI) {
    zrodla[plik] = execFileSync('git', ['show', `${baza}:${plik}`], { cwd: korzen, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
  }
  return zrodla;
}

// Czytelny zapis: każdy przypadek w kilku liniach, punkt listy i wpis dziennika w osobnej linii.
export function zapiszTekst(wzorzec) {
  const j = (v) => JSON.stringify(v);
  const lista = (t, wciecie) => (t.length ? `[\n${t.map((x) => `${wciecie}  ${j(x)}`).join(',\n')}\n${wciecie}]` : '[]');
  const przypadek = ({ wejscie, wynik }) => {
    const pola = Object.entries(wynik).map(([k, v]) => `        ${j(k)}: ${Array.isArray(v) ? lista(v, '        ') : j(v)}`);
    return `    {\n      "wejscie": ${j(wejscie)},\n      "wynik": {\n${pola.join(',\n')}\n      }\n    }`;
  };
  const kategorie = Object.entries(wzorzec.kategorie).map(([k, v]) => `    ${j(k)}: ${j(v)}`).join(',\n');
  const zModulem = Object.entries(wzorzec.kategorieZModulemDawki).map(([k, v]) => `    ${j(k)}: ${j(v)}`).join(',\n');
  const listy = Object.entries(wzorzec.listy).map(([k, v]) => `    ${j(k)}: ${lista(v, '    ')}`).join(',\n');
  return `{\n  "opis": ${lista(wzorzec.opis, '  ')},\n  "baza": ${j(wzorzec.baza)},\n  "pliki": ${j(wzorzec.pliki)},\n`
    + `  "listy": {\n${listy}\n  },\n  "kategorie": {\n${kategorie}\n  },\n  "kategorieZModulemDawki": {\n${zModulem}\n  },\n`
    + `  "przypadki": [\n${wzorzec.przypadki.map(przypadek).join(',\n')}\n  ]\n}\n`;
}

const uruchomionyBezposrednio = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (uruchomionyBezposrednio) {
  const plik = path.join(korzen, PLIK_WZORCA);
  if (process.argv.includes('--roznice')) {
    const przypadki = siatka();
    const baza = wykonajPrzypadki(przypadki, zrodlaBazy());
    const teraz = wykonajPrzypadki(przypadki);
    const rozne = przypadki.filter((p) => kanon(baza.get(p.id)) !== kanon(teraz.get(p.id)));
    for (const p of rozne.slice(0, 30)) console.log(`${p.id}: ${pierwszaRoznica(baza.get(p.id), teraz.get(p.id))}`);
    console.log(`${rozne.length} z ${przypadki.length} przypadków różni się od ${BAZA} (pierwsza wartość: baza, druga: drzewo robocze)`);
    process.exit(rozne.length ? 1 : 0);
  }
  const tekst = zapiszTekst(zbudujWzorzec());
  if (process.argv.includes('--zapisz')) {
    fs.writeFileSync(plik, tekst);
    const w = JSON.parse(tekst);
    const suma = Object.values(w.kategorie).reduce((s, k) => s + k.przypadki, 0);
    console.log(`zapisano ${PLIK_WZORCA}: ${suma} przypadków, ${w.przypadki.length} reprezentatywnych (baza ${BAZA})`);
  } else {
    const zapisany = fs.existsSync(plik) ? fs.readFileSync(plik, 'utf8') : '';
    if (zapisany !== tekst) {
      console.error(`wzorzec ≠ wynik monitora z ${BAZA}: plik wzorca, siatka albo atrapa zmieniły się od zapisu wzorca`);
      process.exit(1);
    }
    console.log(`wzorzec = wynik monitora z ${BAZA}`);
  }
}
