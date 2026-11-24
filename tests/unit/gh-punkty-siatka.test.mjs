import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { opcjePrzedApi, rodzaje, zrodlo } from '../support/gh-monitor-atrapa.mjs';
import {
  KATEGORIE, KATEGORIE_ODMOW, LISTY, NOWE_ID, PLIK_WZORCA, PLIKI, idReprezentatywnych, kanon, korzen, pierwszaRoznica,
  podsumowanieKategorii, siatka, wplywProgramuBiezacego, wplywProgramuEdycji, wplywRegulyKursow, wykonajNaSwiezej,
  wykonajPrzypadki, zProgramemEdytowanego, zProgramemNowego,
} from '../scripts/gh-punkty-wzorzec.mjs';

// P-GH-PUNKTY-TESTY: złota siatka punktów terapii GH. Ok. 10 tys. kombinacji ścieżek Z1 (nowy punkt z karty), Z2 (edycja
// punktu z listy), Z4 (punkt wsteczny) i Z5 (usuwanie) przechodzi przez PRAWDZIWY gh_therapy_monitor.js w atrapie i musi
// dać wynik zapisany we wzorcu tests/fixtures/gh-punkty-wzorzec.json, co do kolejności kluczy i bitu każdej liczby.
// Wzorzec policzył generator tests/scripts/gh-punkty-wzorzec.mjs z dzisiejszego artefaktu; to punkt odniesienia dla
// przeniesienia reguł punktów do wspólnego API. Różnica = zmiana zachowania: najpierw `--roznice`, nigdy `--zapisz` dla
// zielonego wyniku. Opisuje stan obecny, także ten czekający na decyzję właściciela. Dane wyłącznie FIKCYJNE.
// P-GH-PUNKTY-API: od raty 2 monitor bierze reguły punktu z VildaGhPunkty, a od raty 3 (D5) bez modułu nie zapisuje
// (stary kod reguł usunięty). Siatka idzie więc na monitorze z modułem; kontrole negatywne psują API i części monitora,
// którymi idzie zapis. Zamrożony monitor sprzed API (wyrocznia testów równoważności) też musi dać wynik wzorca.
// P-GH-DAWKA-BEZ-MODULU (D6, zmiana kliniczna, wariant b wybrany przez właściciela 2026-10-07): bez modułu dawki
// (modulDawki: false) monitor nie zapisuje i prosi o odświeżenie strony. Przypadki z modułem dawki porównujemy ze skrótami
// wzorca policzonymi tylko z nich (kategorieZModulemDawki, ten sam monitor z BAZA), a przypadki bez modułu — każdy na
// świeżej atrapie — muszą skończyć się odmową bez zapisu. Wzorzec dla nich dalej opisuje zachowanie sprzed D6.
// P-GH-NOWE-ID-MONITOR: id nowego punktu nadaje dzisiejszemu monitorowi VildaGhPunkty.noweId(), a monitorowi z BAZA
// i wyroczni — sam monitor. Każdy przebieg zastępuje znacznikiem wzorca tylko swoją postać id (postać 'api' dla drzewa
// roboczego, 'monitor' dla wyroczni); kontrole negatywne pokazują, że id nadane po dawnemu wywraca porównanie.
// P-GH-WZNOWIENIE, część 2 (zmiana kliniczna, decyzje właściciela 2026-11-20, W2): reguła rodzaju punktu to reguła kursów
// (VildaTrajectoryAnalysis.ghKursy) zamiast „najwyżej jedno Włączenie i jedno Zakończenie”. Przypadki, których wynik
// reguła kursów zmienia (wplywRegulyKursow: każda odmowa „zajęty typ” — inny tekst; zapis albo odmowa na wartościach,
// gdzie dziś odmawia reguła kursów), muszą dać odmowę z tekstem reguły kursów bez zapisu (edycja — każda na świeżej
// atrapie, bo po odmowie formularz zostaje otwarty); pozostałe przypadki z modułem dawki porównujemy ze skrótami wzorca
// policzonymi z BAZA tylko z nich (kategorieRegulaKursow).
// P-GH-PROGRAM-BIEZACY (zmiana kliniczna, decyzja właściciela 2026-11-23): #therProg poza edycją = program bieżący kursu
// (program ostatniego punktu, jak Karta pacjenta), nie program Włączenia. Nowy punkt z karty (Z1) na liście z innym
// programem ostatniego punktu (wplywProgramuBiezacego) ma dziś program bieżący: przypadek reprezentatywny = wynik wzorca
// z programem bieżącym nowego punktu (zProgramemNowego), każdy przypadek — zapis z tym programem, a skrót kategorii liczony
// z wyniku z programem cofniętym do programu Włączenia = skrót BAZA (reszta wyniku bez zmian). Wzorzec bez zmian.
// P-GH-PROGRAM-EDYCJA (zmiana kliniczna, decyzja właściciela 2026-11-23, pytanie 17): #therProg przy edycji = program
// edytowanego punktu, nie program Włączenia. Edycja z zapisem punktu o innym programie niż Włączenie (wplywProgramuEdycji:
// W+bez-id → ZT, W+obce-pole → IGF-1) zapisuje dziś program punktu: przypadek reprezentatywny = wynik wzorca z programem
// edytowanego punktu od zapisu dalej (zProgramemEdytowanego), każdy przypadek — zapis z tym programem, a skrót kategorii
// liczony z wyniku z programem cofniętym do programu Włączenia = skrót BAZA. Wzorzec bez zmian.

const wzorzec = JSON.parse(fs.readFileSync(path.join(korzen, PLIK_WZORCA), 'utf8'));
const przypadki = siatka();
const wedlugId = new Map(przypadki.map((p) => [p.id, p]));
const reprezentatywne = wzorzec.przypadki;
const PODPOWIEDZ = 'Lista różnic: node tests/scripts/gh-punkty-wzorzec.mjs --roznice';

// Kategorie siatki i to, co przypinają. Odmowy są osobną, mniejszą podsiatką.
const OPISY = {
  'Z1-modul': 'Z1 nowy punkt z karty z VildaGhDawka: wynik karty przy zgodnej masie; gałąź zapasowa Gmcalc przy masie '
    + 'niezgodnej, bez wyniku karty i dla preparatu nieznanego; „ngenla 60 mg” jako dobowy — stan obecny — do decyzji (pytania 28, 30)',
  'Z1-bez-modulu': 'Z1 nowy punkt z karty bez VildaGhDawka: od D6 odmowa z prośbą o odświeżenie strony, bez zapisu '
    + '(dawniej gałąź zapasowa: Increlex bez ×2, Ngenla z dawką tygodniową jako dobową; pytania 27, 28)',
  'Z2-modul': 'Z2 edycja punktu z listy z VildaGhDawka: dose = dawka podawana (Increlex × 2)/masa, type z przycisku, program z #therProg '
    + '(od P-GH-PROGRAM-EDYCJA — program edytowanego punktu; pytanie 17), id, pozycja i obce pole zostają — stan obecny — do '
    + 'decyzji (pytanie 30)',
  'Z2-bez-modulu': 'Z2 edycja punktu z listy bez VildaGhDawka: od D6 odmowa z prośbą o odświeżenie strony, bez zapisu, '
    + 'formularz edycji otwarty (dawniej Increlex bez ×2; pytanie 27)',
  'Z4-modul': 'Z4 punkt wsteczny z VildaGhDawka: dose = dawka podawana (Increlex × 2)/masa, Ngenla doseAbs = dawka/7 i 4 dni przy IGF bez '
    + 'dni; „ngenla 60 mg” jako dobowy — stan obecny — do decyzji (pytanie 30)',
  'Z4-bez-modulu': 'Z4 punkt wsteczny bez VildaGhDawka: od D6 odmowa z prośbą o odświeżenie strony, bez zapisu, '
    + 'formularz wsteczny otwarty (dawniej Increlex bez ×2; pytanie 27)',
  Z5: 'Z5 usuwanie przyciskiem i nakładką potwierdzenia: znikają wszystkie punkty o tym samym String(id), także wszystkie '
    + 'bez id; „Anuluj” niczego nie zapisuje — stan obecny — do decyzji (pytanie 18)',
  'Z1-odmowy': 'odmowy Z1: zajęty typ, zła masa, wiek lub wzrost, pusty preparat lub program — bez zapisu, dokładny tekst nakładki',
  'Z2-odmowy': 'odmowy Z2 (każda na świeżej atrapie): zajęty typ, zła masa, wiek, wzrost lub dawka, pusty preparat — bez '
    + 'zapisu, formularz edycji zostaje otwarty',
  'Z4-odmowy': 'odmowy Z4: zajęty typ, zła masa, wiek, wzrost lub dawka, pusty preparat lub program — bez zapisu, '
    + 'formularz wsteczny zostaje otwarty',
};

// Komunikaty monitora dosłownie (nakładka #ghInfoOverlay) według powodu odmowy w siatce.
const DRUGIE = { start: 'Punkt „Włączenie leczenia” został już dodany.', end: 'Punkt „Zakończenie leczenia” został już dodany.' };
const DANE = 'Upewnij się, że wprowadziłeś poprawne, dodatnie dane: wiek, wagę, wzrost oraz dawkę.';
const PROGRAM = {
  Z1: 'Wybierz program i preparat w karcie „Leczenie hormonem wzrostu / IGF-1”.',
  Z2: 'Wybierz program i preparat w karcie „Leczenie hormonem wzrostu / IGF-1”.',
  Z4: 'Wybierz program i preparat w formularzu wstecznego punktu.',
};
const komunikatOdmowy = (p) => {
  if (p.powod === 'typ') return DRUGIE[p.sciezka === 'Z4' ? p.pola.ghRetroType : p.typ];
  return p.powod === 'program' || p.powod === 'preparat' ? PROGRAM[p.sciezka] : DANE;
};

// Zapis kończy dziennik wpisami [M, E, BC]: moduł z {force:true}, zdarzenie z listą równą zapisanej, komunikat kanału
// {type:'update', tabId}; nakładki brak, formularz edycji zamknięty. Odmowa daje [E, K] (wsteczny [E, E, K], bo E
// daje też otwarcie formularza), bez zapisu modułu i kanału, z tekstem według powodu i ze swoim formularzem otwartym.
// „Anuluj” przy usuwaniu nie zostawia żadnego wpisu.
function naruszenie(p, w) {
  const r = rodzaje(w.dziennik).join(',');
  if (KATEGORIE_ODMOW.includes(p.kategoria)) {
    if (r !== (p.sciezka === 'Z4' ? 'E,E,K' : 'E,K')) return `odmowa z dziennikiem ${r}`;
    if (w.komunikat !== komunikatOdmowy(p)) return `odmowa „${p.powod}” z komunikatem ${w.komunikat}`;
    if (w.edycjaWidoczna !== (p.sciezka === 'Z2') || w.wstecznyWidoczny !== (p.sciezka === 'Z4')) return 'formularz po odmowie';
    return null;
  }
  if (p.anuluj) return r === '' ? null : `„Anuluj” z wpisami: ${r}`;
  if (!r.endsWith('M,E,BC')) return `zapis bez [M, E, BC]: ${r}`;
  const [m, e, bc] = w.dziennik.slice(-3);
  if (kanon(m.opcje) !== '{"force":true}') return `opcje zapisu ${kanon(m.opcje)}`;
  if (kanon(e.okno) !== kanon(m.wartosc)) return 'lista w chwili E ≠ lista zapisana';
  if (kanon(bc.wiadomosc) !== '{"type":"update","tabId":"fikcyjna-karta-1"}') return `kanał ${kanon(bc.wiadomosc)}`;
  if (w.komunikat !== null || w.edycjaWidoczna) return 'nakładka albo formularz edycji po zapisie';
  return null;
}

// D6: bez modułu dawki każdy zapis i usunięcie kończy się komunikatem odmowy (wpis K ostatni), bez zapisu modułu, kanału
// i wskaźnika zapisu; lista w oknie = lista w pamięci modułu; formularz, z którego lekarz zapisywał, zostaje otwarty.
// „Anuluj” przy usuwaniu nie zostawia żadnego wpisu.
const ODSWIEZ = 'Nie zapisano: aplikacja nie wczytała się w całości. Odśwież stronę i spróbuj ponownie.';
function naruszenieBezModuluDawki(p, w) {
  const r = rodzaje(w.dziennik);
  if (p.anuluj) return r.length === 0 ? null : `„Anuluj” z wpisami: ${r.join(',')}`;
  if (r.some((x) => x !== 'E' && x !== 'K')) return `bez modułu dawki zapis albo kanał: ${r.join(',')}`;
  if (r.at(-1) !== 'K' || w.komunikat !== ODSWIEZ) return `bez modułu dawki komunikat ${w.komunikat}`;
  if (w.powiadomienia.length) return `powiadomienia ${w.powiadomienia.join(',')}`;
  if (kanon(w.lista) !== kanon(w.modul)) return 'lista w oknie ≠ lista w pamięci modułu';
  if (p.sciezka === 'Z2' && !w.edycjaWidoczna) return 'formularz edycji zamknięty po odmowie';
  if (p.sciezka === 'Z4' && !w.wstecznyWidoczny) return 'formularz wsteczny zamknięty po odmowie';
  return null;
}
// P-GH-WZNOWIENIE, część 2: odmowa reguły kursów — [E, K] (wsteczny [E, E, K]), tekst reguły, bez zapisu, swój formularz
// otwarty.
function naruszenieRegulyKursow(p, w, wplyw) {
  const r = rodzaje(w.dziennik).join(',');
  if (r !== (p.sciezka === 'Z4' ? 'E,E,K' : 'E,K')) return `odmowa reguły kursów (${wplyw.kod}) z dziennikiem ${r}`;
  if (w.komunikat !== wplyw.komunikat) return `odmowa reguły kursów (${wplyw.kod}) z komunikatem ${w.komunikat}`;
  if (w.edycjaWidoczna !== (p.sciezka === 'Z2') || w.wstecznyWidoczny !== (p.sciezka === 'Z4')) return 'formularz po odmowie reguły kursów';
  if (kanon(w.lista) !== kanon(w.modul)) return 'lista w oknie ≠ lista w pamięci modułu po odmowie reguły kursów';
  return null;
}
const WPLYW = new Map(przypadki.map((p) => [p.id, wplywRegulyKursow(p)]));
const zmienionaRegula = (p) => !!WPLYW.get(p.id);
// Edycja zmieniona regułą kursów kończy się odmową z otwartym formularzem — na świeżej atrapie.
const doWykonania = (lista) => lista.map((p) => (zmienionaRegula(p) && p.sciezka === 'Z2' && !p.swieza ? { ...p, swieza: true } : p));
// P-GH-PROGRAM-BIEZACY: przypadki ze zmienionym programem nowego punktu i oczekiwany wynik przypadku reprezentatywnego.
const PROGRAM_BIEZACY = new Map(przypadki.map((p) => [p.id, wplywProgramuBiezacego(p)]));
// P-GH-PROGRAM-EDYCJA: przypadki edycji ze zmienionym programem edytowanego punktu.
const PROGRAM_EDYCJI = new Map(przypadki.map((p) => [p.id, wplywProgramuEdycji(p)]));
const oczekiwany = (r) => {
  const nowy = PROGRAM_BIEZACY.get(r.wejscie.id);
  if (nowy) return zProgramemNowego(r.wynik, nowy.teraz);
  const edycja = PROGRAM_EDYCJI.get(r.wejscie.id);
  return edycja ? zProgramemEdytowanego(r.wynik, edycja.indeks, edycja.teraz) : r.wynik;
};
const programyNowych = (w) => w.lista.filter((x) => x && x.id === NOWE_ID).map((x) => x.program);
function naruszenieProgramu(p, w) {
  const n = naruszenie(p, w);
  if (n) return n;
  const progr = programyNowych(w);
  return progr.length === 1 && progr[0] === PROGRAM_BIEZACY.get(p.id).teraz ? null : `program nowego punktu ${JSON.stringify(progr)}`;
}
function naruszenieProgramuEdycji(p, w) {
  const n = naruszenie(p, w);
  if (n) return n;
  const { indeks, teraz } = PROGRAM_EDYCJI.get(p.id);
  const zapisany = [w.lista, w.modul].map((l) => (Array.isArray(l) && l[indeks] ? l[indeks].program : null));
  return zapisany.every((x) => x === teraz) ? null : `program edytowanego punktu ${JSON.stringify(zapisany)}`;
}
// Wyniki do skrótu BAZA: program nowego punktu (P-GH-PROGRAM-BIEZACY) i edytowanego punktu (P-GH-PROGRAM-EDYCJA) cofnięty
// do programu Włączenia.
const doBazy = (lista, wyniki) => new Map(lista.map((p) => {
  const nowy = PROGRAM_BIEZACY.get(p.id);
  const edycja = PROGRAM_EDYCJI.get(p.id);
  const w = wyniki.get(p.id);
  return [p.id, nowy ? zProgramemNowego(w, nowy.dotad) : edycja ? zProgramemEdytowanego(w, edycja.indeks, edycja.dotad) : w];
}));
const zModulemDawki = (lista) => lista.filter((p) => p.modulDawki);
const bezModuluDawki = (lista) => lista.filter((p) => !p.modulDawki).map((p) => ({ ...p, swieza: true }));

describe('Złota siatka punktów GH — budowa siatki i wzorca', () => {
  it('10–20 tys. przypadków; co najmniej połowa to zapisy, a odmowy są osobną, mniejszą podsiatką', () => {
    expect(przypadki.length).toBeGreaterThanOrEqual(10_000);
    expect(przypadki.length).toBeLessThanOrEqual(20_000);
    expect(Object.keys(OPISY)).toEqual(KATEGORIE);
    expect(new Set(przypadki.map((p) => p.kategoria))).toEqual(new Set(KATEGORIE));
    expect(new Set(przypadki.map((p) => p.sciezka))).toEqual(new Set(['Z1', 'Z2', 'Z4', 'Z5']));
    // Liczności wzorca zgadzają się z siatką; zapisy i odmowy sprawdza wynik monitora w kategoriach niżej (skrót).
    for (const k of KATEGORIE) {
      expect(wzorzec.kategorie[k].przypadki, k).toBe(przypadki.filter((p) => p.kategoria === k).length);
      expect(wzorzec.kategorieZModulemDawki[k].przypadki, k).toBe(przypadki.filter((p) => p.kategoria === k && p.modulDawki).length);
      expect(wzorzec.kategorieRegulaKursow[k].przypadki, k)
        .toBe(przypadki.filter((p) => p.kategoria === k && p.modulDawki && !zmienionaRegula(p)).length);
    }
    const zapisy = KATEGORIE.reduce((s, k) => s + wzorzec.kategorie[k].zapisy, 0);
    const odmowy = KATEGORIE_ODMOW.reduce((s, k) => s + wzorzec.kategorie[k].przypadki, 0);
    expect(zapisy).toBeGreaterThanOrEqual(przypadki.length / 2);
    expect(odmowy).toBeLessThan(zapisy);
    for (const k of KATEGORIE) {
      const { zapisy: z, bezZapisu: b } = wzorzec.kategorie[k];
      if (KATEGORIE_ODMOW.includes(k)) expect(z, k).toBe(0);
      else if (k === 'Z5') expect(b, k).toBe(przypadki.filter((p) => p.kategoria === k && p.anuluj).length);
      else expect(b, k).toBe(0);
    }
  });

  it('P-GH-WZNOWIENIE, część 2: reguła kursów zmienia każdą odmowę „zajęty typ” i część zapisów — wszystkimi rodzajami odmowy reguły', () => {
    const zmienione = przypadki.filter(zmienionaRegula);
    expect(przypadki.filter((p) => p.powod === 'typ' && p.modulDawki).every(zmienionaRegula)).toBe(true);
    // Po przeglądzie (2026-11-20) Włączenie w pierwszym kursie po wcześniejszej Kontynuacji jest przyjmowane — siatka (jeden
    // kurs) nie ma już odmów „wlaczenie-pozniej”.
    expect(new Set(zmienione.map((p) => WPLYW.get(p.id).kod))).toEqual(new Set(['drugie-wlaczenie', 'drugie-zakonczenie',
      'zakonczenie-bez-kursu', 'zakonczenie-nie-ostatnie']));
    for (const k of ['Z1-modul', 'Z2-modul', 'Z4-modul']) expect(zmienione.some((p) => p.kategoria === k), k).toBe(true);
    expect(zmienione.some((p) => p.kategoria === 'Z5' || !p.modulDawki)).toBe(false);
    // Większość przypadków bez zmian (skróty z BAZA).
    expect(zmienione.length).toBeLessThan(przypadki.filter((p) => p.modulDawki).length / 4);
  });

  it('P-GH-PROGRAM-BIEZACY: program bieżący zmienia tylko nowy punkt z karty na listach z innym programem ostatniego punktu (W+bez-id → ZT, W+obce-pole → IGF-1; dotąd SNP Włączenia)', () => {
    const zmienione = przypadki.filter((p) => PROGRAM_BIEZACY.get(p.id));
    expect(zmienione.length).toBeGreaterThan(0);
    expect(new Set(zmienione.map((p) => p.kategoria))).toEqual(new Set(['Z1-modul']));
    expect(Object.fromEntries(zmienione.map((p) => [p.lista, PROGRAM_BIEZACY.get(p.id)]))).toEqual({
      'W+bez-id': { dotad: 'SNP', teraz: 'ZT' }, 'W+obce-pole': { dotad: 'SNP', teraz: 'IGF-1' },
    });
    // Każdy zapis Z1 na tych listach (bez odmowy reguły kursów) — i tylko one; przypadki reprezentatywne też.
    const naListach = przypadki.filter((p) => p.kategoria === 'Z1-modul' && ['W+bez-id', 'W+obce-pole'].includes(p.lista)
      && !zmienionaRegula(p));
    expect(zmienione.map((p) => p.id)).toEqual(naListach.map((p) => p.id));
    expect(reprezentatywne.some((r) => PROGRAM_BIEZACY.get(r.wejscie.id))).toBe(true);
  });

  it('P-GH-PROGRAM-EDYCJA: program przy edycji zmienia tylko zapis edycji punktu o innym programie niż Włączenie (W+bez-id, punkt bez id → ZT; W+obce-pole, fikc-k2 → IGF-1; dotąd SNP Włączenia)', () => {
    const zmienione = przypadki.filter((p) => PROGRAM_EDYCJI.get(p.id));
    expect(new Set(zmienione.map((p) => p.kategoria))).toEqual(new Set(['Z2-modul']));
    expect(Object.fromEntries(zmienione.map((p) => [`${p.lista} ${p.cel}`, PROGRAM_EDYCJI.get(p.id)]))).toEqual({
      'W+bez-id undefined': { indeks: 1, dotad: 'SNP', teraz: 'ZT' }, 'W+obce-pole fikc-k2': { indeks: 1, dotad: 'SNP', teraz: 'IGF-1' },
    });
    // Każdy zapis Z2 edytowanego punktu o innym programie (bez odmowy reguły kursów) — i tylko one; reprezentatywne też.
    const tePunkty = przypadki.filter((p) => p.kategoria === 'Z2-modul' && !zmienionaRegula(p)
      && ((p.lista === 'W+bez-id' && p.cel === 'undefined') || (p.lista === 'W+obce-pole' && p.cel === 'fikc-k2')));
    expect(zmienione.map((p) => p.id)).toEqual(tePunkty.map((p) => p.id));
    expect(zmienione.length).toBe(253);
    // Edycja punktu z programem Włączenia (fikc-w1, W+Z, dawny format) — bez zmian.
    expect(przypadki.some((p) => p.kategoria === 'Z2-modul' && p.cel === 'fikc-w1' && PROGRAM_EDYCJI.get(p.id))).toBe(false);
    expect(reprezentatywne.some((r) => PROGRAM_EDYCJI.get(r.wejscie.id))).toBe(true);
    // Nie nakłada się na program bieżący nowego punktu z karty.
    expect(zmienione.some((p) => PROGRAM_BIEZACY.get(p.id))).toBe(false);
  });

  it('wzorzec ma te same listy punktów, pliki i przypadki reprezentatywne co siatka (ok. 200, wejście bez zmian)', () => {
    expect(kanon(wzorzec.listy)).toBe(kanon(LISTY));
    expect(wzorzec.pliki).toEqual(PLIKI);
    expect(reprezentatywne.length).toBeGreaterThanOrEqual(150);
    expect(reprezentatywne.length).toBeLessThanOrEqual(250);
    expect(reprezentatywne.map((r) => r.wejscie.id)).toEqual(idReprezentatywnych(przypadki));
    for (const r of reprezentatywne) expect(kanon(r.wejscie), r.wejscie.id).toBe(kanon(wedlugId.get(r.wejscie.id)));
    // Każda kategoria ma przypadki reprezentatywne, czyli czytelną różnicę obok skrótu.
    for (const k of KATEGORIE) expect(reprezentatywne.some((r) => r.wejscie.kategoria === k), k).toBe(true);
  });
});

describe('Złota siatka punktów GH — prawdziwy monitor daje wynik wzorca', () => {
  for (const kategoria of KATEGORIE) {
    it(OPISY[kategoria], () => {
      const czesc = przypadki.filter((p) => p.kategoria === kategoria);
      const zModulem = zModulemDawki(czesc);
      const wyniki = wykonajPrzypadki(doWykonania(zModulem));

      // Pełny wynik przypadków reprezentatywnych: najpierw czytelna różnica, potem kolejność kluczy i bity liczb.
      for (const r of reprezentatywne.filter((x) => x.wejscie.kategoria === kategoria && x.wejscie.modulDawki)) {
        const w = wyniki.get(r.wejscie.id);
        if (zmienionaRegula(r.wejscie)) {
          expect(naruszenieRegulyKursow(r.wejscie, w, WPLYW.get(r.wejscie.id)), r.wejscie.id).toBeNull();
          continue;
        }
        // P-GH-PROGRAM-BIEZACY i P-GH-PROGRAM-EDYCJA: wynik wzorca z programem bieżącym nowego punktu albo z programem
        // edytowanego punktu (oczekiwany).
        expect(w, r.wejscie.id).toEqual(oczekiwany(r));
        expect(pierwszaRoznica(oczekiwany(r), w), r.wejscie.id).toBeNull();
      }
      // Niezmienniki czytelne bez wzorca, dla każdego przypadku kategorii z modułem dawki (P-GH-WZNOWIENIE, część 2:
      // przypadki zmienione regułą kursów — odmowa z tekstem reguły kursów).
      const naruszenia = zModulem.map((p) => [p.id, zmienionaRegula(p)
        ? naruszenieRegulyKursow(p, wyniki.get(p.id), WPLYW.get(p.id))
        : PROGRAM_BIEZACY.get(p.id) ? naruszenieProgramu(p, wyniki.get(p.id))
          : PROGRAM_EDYCJI.get(p.id) ? naruszenieProgramuEdycji(p, wyniki.get(p.id)) : naruszenie(p, wyniki.get(p.id))]).filter(([, n]) => n);
      expect(naruszenia).toEqual([]);
      // Całość części z modułem dawki bez przypadków zmienionych regułą kursów: skrót SHA-256 po id, wejściu i wyniku
      // kanonicznym każdego przypadku; skróty z BAZA (kategorieRegulaKursow). P-GH-PROGRAM-BIEZACY i P-GH-PROGRAM-EDYCJA:
      // przypadki ze zmienionym programem nowego albo edytowanego punktu wchodzą z programem cofniętym do programu Włączenia
      // (reszta wyniku jak BAZA).
      const bezZmiany = zModulem.filter((p) => !zmienionaRegula(p));
      expect(podsumowanieKategorii(bezZmiany, doBazy(bezZmiany, wyniki))[kategoria], PODPOWIEDZ)
        .toEqual(wzorzec.kategorieRegulaKursow[kategoria]);

      // D6: każdy przypadek bez modułu dawki — odmowa bez zapisu.
      const bez = bezModuluDawki(czesc);
      const wynikiBez = wykonajPrzypadki(bez);
      const naruszeniaBez = bez.map((p) => [p.id, naruszenieBezModuluDawki(p, wynikiBez.get(p.id))]).filter(([, n]) => n);
      expect(naruszeniaBez).toEqual([]);
      expect(bez.length + zModulem.length).toBe(czesc.length);
    }, 120_000);
  }
});

describe('Złota siatka punktów GH — atrapa użyta ponownie nie przenosi stanu między przypadkami', () => {
  it('każdy przypadek reprezentatywny na świeżej atrapie (lista w module przed startem monitora) daje wynik wzorca', () => {
    for (const r of reprezentatywne) {
      const p = wedlugId.get(r.wejscie.id);
      const w = wykonajNaSwiezej(p);
      // D6: bez modułu dawki odmowa zamiast wyniku wzorca; P-GH-WZNOWIENIE, część 2: odmowa reguły kursów.
      if (!p.modulDawki) expect(naruszenieBezModuluDawki(p, w), r.wejscie.id).toBeNull();
      else if (zmienionaRegula(p)) expect(naruszenieRegulyKursow(p, w, WPLYW.get(p.id)), r.wejscie.id).toBeNull();
      else expect(pierwszaRoznica(oczekiwany(r), w), r.wejscie.id).toBeNull();
    }
  }, 60_000);
});

describe('Złota siatka punktów GH — wyrocznia testów równoważności', () => {
  it('zamrożony monitor sprzed API (bez VildaGhPunkty) daje wynik wzorca dla przypadków reprezentatywnych', () => {
    const { zrodla, ...opcje } = opcjePrzedApi();
    const wyniki = wykonajPrzypadki(reprezentatywne.map((r) => wedlugId.get(r.wejscie.id)), zrodla, opcje, 'monitor');
    for (const r of reprezentatywne) expect(pierwszaRoznica(r.wynik, wyniki.get(r.wejscie.id)), r.wejscie.id).toBeNull();
  }, 60_000);
});

// Kontrole negatywne: kopia źródła API albo monitora zmieniona przez replace z kotwicą występującą dokładnie raz.
// Każda zmiana musi wywrócić porównanie przypadków reprezentatywnych ze wzorcem, i to tylko na ścieżkach, których
// dotyczy. Psujemy kod, którym idzie zapis: reguły i zapis listy w API oraz części monitora poza API (kanał z tabId,
// rekord nowego punktu z karty).
// Zapis w VildaGhPunkty.zapisz: krok 1 (zapis modułu) za krokiem 2 (zdarzenie).
const ZAPIS_API = `    try {
      var P = persistence();`;
const ZDARZENIE_API = `    try {
      w.document.dispatchEvent(`;
const KONIEC_ZDARZENIA_API = `    } catch (e) { /* brak document albo CustomEvent */ }
`;
function kontrolaMPoEApi(tekst) {
  const i = tekst.indexOf(ZAPIS_API);
  const j = tekst.indexOf(ZDARZENIE_API, i);
  const k = tekst.indexOf(KONIEC_ZDARZENIA_API, j) + KONIEC_ZDARZENIA_API.length;
  const blokZapisu = tekst.slice(i, j);
  const blokZdarzenia = tekst.slice(j, k);
  return [blokZapisu + blokZdarzenia, blokZdarzenia + blokZapisu];
}
const KONTROLE = [
  { nazwa: 'API: Increlex ×3 zamiast ×2', plik: 'vilda_gh_punkty.js',
    kotwica: 'return naPodanie(preparat, opcje) ? podawana * 2 : podawana;',
    zamiana: 'return naPodanie(preparat, opcje) ? podawana * 3 : podawana;',
    dotyczy: (p) => p.modulDawki && (p.sciezka === 'Z2' || p.sciezka === 'Z4') },
  { nazwa: 'API: doseAbs Ngenla /7 → /6', plik: 'vilda_gh_punkty.js',
    kotwica: 'doseAbs: /tydz/.test(jednostka) ? podawana / 7 : dobowa',
    zamiana: 'doseAbs: /tydz/.test(jednostka) ? podawana / 6 : dobowa',
    dotyczy: (p) => p.sciezka === 'Z2' || p.sciezka === 'Z4' },
  { nazwa: 'API: zapis modułu (M) po zdarzeniu (E) w zapisz()', plik: 'vilda_gh_punkty.js', kotwicaZe: kontrolaMPoEApi,
    dotyczy: () => true },
  { nazwa: 'API: /^Ngenla/ → /^Ngenla/i w jednostce dawki', plik: 'vilda_gh_punkty.js',
    kotwica: 'preparat && /^Ngenla/.test(preparat)', zamiana: 'preparat && /^Ngenla/i.test(preparat)',
    dotyczy: (p) => p.sciezka === 'Z1' || p.sciezka === 'Z2' || p.sciezka === 'Z4' },
  { nazwa: 'monitor: brak tabId w komunikacie kanału', plik: 'gh_therapy_monitor.js',
    kotwica: 'e.tabId=t.getTabId()', zamiana: 'void 0', dotyczy: () => true },
  { nazwa: 'monitor: kolejność kluczy weight i height w rekordzie nowego punktu', plik: 'gh_therapy_monitor.js',
    kotwica: 'weight:r,height:i,boneAge:isFinite(a)?a:null,dose:o,', zamiana: 'height:i,weight:r,boneAge:isFinite(a)?a:null,dose:o,',
    dotyczy: (p) => p.sciezka === 'Z1' },
  // P-GH-NOWE-ID-MONITOR: id nowego punktu z VildaGhPunkty.noweId(). Monitor nadający id sam (dawny wzór) albo noweId
  // z innym startem w milisekundzie dają id innej postaci, które zostaje dosłownie i różni się od znacznika wzorca.
  { nazwa: 'monitor: nowy punkt z karty z własnym id String(Date.now()+Math.random())', plik: 'gh_therapy_monitor.js',
    kotwica: 'const u={id:Gpk.noweId(),', zamiana: 'const u={id:String(Date.now()+Math.random()),',
    dotyczy: (p) => p.sciezka === 'Z1' },
  { nazwa: 'monitor: punkt wsteczny z własnym id String(Date.now()+Math.random())', plik: 'gh_therapy_monitor.js',
    kotwica: 'Gpk.punkt(Gpk.noweId(),Gpw.pola)', zamiana: 'Gpk.punkt(String(Date.now()+Math.random()),Gpw.pola)',
    dotyczy: (p) => p.sciezka === 'Z4' },
  { nazwa: 'API: noweId zaczyna milisekundę od Math.random()·400 zamiast ·500', plik: 'vilda_gh_punkty.js',
    kotwica: 'teraz + Math.floor(Math.random() * 500)', zamiana: 'teraz + Math.floor(Math.random() * 400)',
    dotyczy: (p) => p.sciezka === 'Z1' || p.sciezka === 'Z4' },
  // Bramka raty 3: monitor bez zgodnego API odmawia każdego zapisu i usunięcia; „Anuluj” przy usuwaniu bez zmian.
  // Każdy przypadek na świeżej atrapie (atrapa użyta ponownie przyjmuje tylko edycje zakończone zapisem).
  // P-GH-WZNOWIENIE, część 2: monitor zna tylko API wersji 4 (reguła kursów).
  { nazwa: 'monitor: bramka odrzuca API (wersja 4 → 5)', plik: 'gh_therapy_monitor.js',
    kotwica: 'A&&A.wersja===4&&', zamiana: 'A&&A.wersja===5&&', dotyczy: (p) => !p.anuluj, swieza: true },
  // P-GH-PUNKTY-USZKODZONE: bramka uszkodzonych wpisów stoi na drodze każdego zapisu i usunięcia (siatka ma listy bez
  // takich wpisów, więc dziś zawsze przepuszcza; ta kopia odmawia zawsze).
  // P-GH-PROGRAM-BIEZACY: #therProg znów z programu Włączenia — wzorzec z programem bieżącym wykrywa to tylko w przypadkach
  // nowego punktu z karty, których program się zmienił (od P-GH-PROGRAM-EDYCJA także edycji, bo pole przy edycji też
  // idzie przez ghProgramPola).
  { nazwa: 'monitor: #therProg z programu Włączenia (bez programu bieżącego)', plik: 'gh_therapy_monitor.js',
    kotwica: '/* P-GH-PROGRAM-BIEZACY */l=ghProgramPola(Gwk,l),', zamiana: '',
    dotyczy: (p) => !!PROGRAM_BIEZACY.get(p.id) || !!PROGRAM_EDYCJI.get(p.id) },
  // P-GH-PROGRAM-EDYCJA: #therProg przy edycji znów z programu Włączenia (ghProgramPola sprzed tej zmiany) — wykrywają to
  // tylko przypadki edycji punktu o innym programie niż Włączenie.
  { nazwa: 'monitor: #therProg przy edycji z programu Włączenia (bez programu edytowanego punktu)', plik: 'gh_therapy_monitor.js',
    kotwica: 'x != null ? ghProgramEdycji(Gwk, dotad) :', zamiana: 'x != null ? dotad :',
    dotyczy: (p) => !!PROGRAM_EDYCJI.get(p.id) },
  { nazwa: 'monitor: bramka uszkodzonych wpisów zawsze odmawia', plik: 'gh_therapy_monitor.js',
    kotwica: 'function Gpg(A){const n=A.uszkodzone(window.ghTherapyPoints).length;',
    zamiana: 'function Gpg(A){const n=1;', dotyczy: (p) => !p.anuluj, swieza: true },
];

describe('Złota siatka punktów GH — kontrole negatywne', () => {
  // Przypadki reprezentatywne z modułem dawki (bez modułu monitor od D6 odmawia, zanim sięgnie po API), bez przypadków
  // zmienionych regułą kursów (P-GH-WZNOWIENIE, część 2 — ich wynik i tak różni się od wzorca).
  const zModulemRepr = reprezentatywne.filter((r) => r.wejscie.modulDawki && !zmienionaRegula(r.wejscie));
  const wejscia = zModulemRepr.map((r) => wedlugId.get(r.wejscie.id));

  for (const k of KONTROLE) {
    it(`${k.nazwa}: wzorzec wykrywa zmianę`, () => {
      const zrodloPliku = zrodlo(k.plik);
      const [kotwica, zamiana] = k.kotwicaZe ? k.kotwicaZe(zrodloPliku) : [k.kotwica, k.zamiana];
      expect(zrodloPliku.split(kotwica).length - 1).toBe(1);
      const zmienione = zrodloPliku.replace(kotwica, () => zamiana);
      expect(zmienione).not.toBe(zrodloPliku);

      const wyniki = wykonajPrzypadki(k.swieza ? wejscia.map((p) => ({ ...p, swieza: true })) : wejscia, { [k.plik]: zmienione });
      const rozne = zModulemRepr.filter((r) => kanon(wyniki.get(r.wejscie.id)) !== kanon(oczekiwany(r))).map((r) => r.wejscie);
      expect(rozne.length).toBeGreaterThan(0);
      expect(rozne.filter((p) => !k.dotyczy(p)).map((p) => p.id)).toEqual([]);
    }, 60_000);
  }
});
