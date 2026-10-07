import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadBrowserScript } from '../support/load-browser-script.mjs';

// P-GH-PUNKTY-API rata 1 (PR-3). Przypadki „wejście → oczekiwany wynik” na PRAWDZIWYCH funkcjach VildaGhPunkty
// (vilda_gh_punkty.js). loadBrowserScript ładuje przed nim moduł dawki (vilda_gh_dawka_dane.js, vilda_gh_dawka.js —
// ZALEZNOSCI), bo bez niego Increlex liczy się bez × 2. Wartości oczekiwane policzono ręcznie z reguł monitora
// (gh_therapy_monitor.js: edycja punktu He, punkt wsteczny ghAddRetroPoint, ghRetroSyncTypeOptions) i zgadzają się
// z testem charakteryzującym tests/unit/gh-punkty-charakterystyka-monitor.test.mjs. Teksty odmów są skopiowane
// z monitora (i z charakterystyki), nie z modułu. Tu nie ma funkcji z efektami (wczytaj, zapisz, gotowe) poza
// sprawdzeniem, że samo załadowanie modułu niczego nie czyta, nie zapisuje i nie nasłuchuje.
// To nie jest test kliniczny: liczby są fikcyjne i dobrane tak, żeby wynik dało się sprawdzić ręcznie.
// Dane wyłącznie FIKCYJNE.

const korzen = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

const w = loadBrowserScript('vilda_gh_punkty.js', {});
const A = w.VildaGhPunkty;

// 15 kluczy rekordu w kolejności zapisu monitora (mapa punktów GH, §1.1).
const KLUCZE = ['id', 'type', 'ageYears', 'ageMonths', 'weight', 'height', 'boneAge', 'dose', 'doseUnit', 'drug',
  'program', 'igf1', 'igf1Unit', 'igf1DaysSinceDose', 'doseAbs'];

// Komunikaty monitora dosłownie (nakładka #ghInfoOverlay, nagłówek „Informacja”).
const DRUGIE_WLACZENIE = 'Punkt „Włączenie leczenia” został już dodany.';
const DRUGIE_ZAKONCZENIE = 'Punkt „Zakończenie leczenia” został już dodany.';
const DANE = 'Upewnij się, że wprowadziłeś poprawne, dodatnie dane: wiek, wagę, wzrost oraz dawkę.';
const PROGRAM_KARTA = 'Wybierz program i preparat w karcie „Leczenie hormonem wzrostu / IGF-1”.';
const PROGRAM_WSTECZNY = 'Wybierz program i preparat w formularzu wstecznego punktu.';

const ODMOWA_DANE = { ok: false, kod: 'wartosci', komunikat: DANE };

// Fikcyjny punkt w dzisiejszym kształcie (15 kluczy) — jak w teście charakteryzującym.
const punktFikcyjny = (id, type, nadpisania = {}) => ({
  id, type, ageYears: 9, ageMonths: 0, weight: 32, height: 130, boneAge: null, dose: 0.025, doseUnit: 'mg/kg/d',
  drug: 'Omnitrope 10 mg', program: 'SNP', igf1: null, igf1Unit: 'ng/mL', igf1DaysSinceDose: null, doseAbs: 0.8,
  ...nadpisania,
});
const WLACZENIE = punktFikcyjny('fikc-start', 'start');
const KONTYNUACJA = punktFikcyjny('fikc-kont', 'continue', { ageYears: 10, weight: 36, height: 138, doseAbs: 0.9 });
const ZAKONCZENIE = punktFikcyjny('fikc-koniec', 'end', { ageYears: 12, weight: 40, height: 150, doseAbs: 1 });

// Wejście polaZPodawanej z pól formularza tak, jak czyta je monitor (napisy z <input>); przypadki zmieniają jedno pole.
// Omnitrope 10 mg, 0,96 mg/d przy 32 kg = 0,03 mg/kg/d (ten sam punkt wsteczny co w teście charakteryzującym).
const POLA_FORMULARZA = {
  typ: 'continue', lata: '9', miesiace: '6', masa: '32', wzrost: '133', wiekKostny: '', podawana: '0.96',
  preparat: 'Omnitrope 10 mg', program: 'SNP', igf1: '', dniIgf: '',
};
// Rekord (bez id) zapisany przez monitor dla POLA_FORMULARZA.
const POLA_OCZEKIWANE = {
  type: 'continue', ageYears: 9, ageMonths: 6, weight: 32, height: 133, boneAge: null, dose: 0.03, doseUnit: 'mg/kg/d',
  drug: 'Omnitrope 10 mg', program: 'SNP', igf1: null, igf1Unit: 'ng/mL', igf1DaysSinceDose: null, doseAbs: 0.96,
};

// Okno z samym vilda_gh_punkty.js, bez modułu dawki (jak strona, na której VildaGhDawka się nie załadował).
function oknoBezModuluDawki() {
  const o = {};
  new Function('window', 'globalThis', fs.readFileSync(path.join(korzen, 'vilda_gh_punkty.js'), 'utf8'))(o, o);
  return o;
}

// Liczby porównujemy przez Object.is (NaN, -0), a kolejność kluczy osobno.
function oczekujRekordu(rzeczywisty, oczekiwany, opis) {
  expect(Object.keys(rzeczywisty), opis).toEqual(Object.keys(oczekiwany));
  for (const k of Object.keys(oczekiwany)) {
    expect(Object.is(rzeczywisty[k], oczekiwany[k]), `${opis}: ${k} = ${String(rzeczywisty[k])}`).toBe(true);
  }
}

describe('Moduł i dane zamrożone', () => {
  it('ładuje się z modułem dawki jako zależnością; wersja 1', () => {
    expect(A.wersja).toBe(1);
    // ZALEZNOSCI w load-browser-script.mjs: bez tego Increlex liczyłby się bez × 2.
    expect(w.VildaGhDawka.preparat('Increlex 40 mg').schemat).toBe('naPodanie');
  });

  it('KLUCZE: 15 kluczy w kolejności rekordu (id na początku, doseAbs na końcu); RODZAJE: start, continue, end', () => {
    expect(A.KLUCZE).toEqual(KLUCZE);
    expect(A.KLUCZE).toHaveLength(15);
    expect(A.KLUCZE[0]).toBe('id');
    expect(A.KLUCZE.at(-1)).toBe('doseAbs');
    expect(A.RODZAJE).toEqual(['start', 'continue', 'end']);
  });

  it('KOMUNIKATY: 5 tekstów dosłownie jak w monitorze', () => {
    expect(A.KOMUNIKATY).toEqual({
      drugieWlaczenie: DRUGIE_WLACZENIE,
      drugieZakonczenie: DRUGIE_ZAKONCZENIE,
      wartosci: DANE,
      programKarta: PROGRAM_KARTA,
      programWsteczny: PROGRAM_WSTECZNY,
    });
    // Dwie kopie tekstów do PR-4: każdy tekst z tego testu występuje w źródle monitora (po rozwinięciu \uXXXX).
    const monitor = fs.readFileSync(path.join(korzen, 'gh_therapy_monitor.js'), 'utf8')
      .replace(/\\u([0-9a-fA-F]{4})/g, (_, h) => String.fromCharCode(parseInt(h, 16)));
    for (const tekst of [DRUGIE_WLACZENIE, DRUGIE_ZAKONCZENIE, DANE, PROGRAM_KARTA, PROGRAM_WSTECZNY]) {
      expect(monitor, tekst).toContain(tekst);
    }
  });

  it('obiekt API i stałe są zamrożone; przypisanie w trybie ścisłym rzuca TypeError', () => {
    expect(Object.isFrozen(A)).toBe(true);
    expect(Object.isFrozen(A.KLUCZE)).toBe(true);
    expect(Object.isFrozen(A.RODZAJE)).toBe(true);
    expect(Object.isFrozen(A.KOMUNIKATY)).toBe(true);
    expect(() => { A.wersja = 2; }).toThrow(TypeError);
    expect(() => { A.KLUCZE.push('obce'); }).toThrow(TypeError);
    expect(() => { A.KOMUNIKATY.wartosci = 'inny tekst'; }).toThrow(TypeError);
    expect(() => { A.normalizujWiek = () => null; }).toThrow(TypeError);
  });
});

// Okno-atrapa, w którym każde użycie magazynu, kanału, słuchacza, dokumentu i timera trafia do dziennika:
// odczyt własności okna, odczyt i zapis własności obiektu, wywołanie i konstrukcja.
const OBSERWOWANE = ['VildaPersistence', 'sessionStorage', 'localStorage', 'BroadcastChannel', 'addEventListener',
  'removeEventListener', 'document', 'CustomEvent', 'indexedDB', 'setTimeout', 'setInterval', 'ghTherapyPoints'];
const DEFINIOWANE = ['VildaGhDawkaDane', 'VildaGhDawka', 'VildaGhPunkty'];

function oknoRejestrujace() {
  const uzycia = [];
  const sledz = (nazwa, cel) => new Proxy(cel, {
    get(t, k, r) { uzycia.push(`${nazwa}.${String(k)}`); return Reflect.get(t, k, r); },
    set(t, k, v, r) { uzycia.push(`${nazwa}.${String(k)} =`); return Reflect.set(t, k, v, r); },
    has(t, k) { uzycia.push(`${String(k)} in ${nazwa}`); return Reflect.has(t, k); },
    apply(t, ten, a) { uzycia.push(`${nazwa}()`); return Reflect.apply(t, ten, a); },
    construct(t, a, nt) { uzycia.push(`new ${nazwa}`); return Reflect.construct(t, a, nt); },
  });
  const magazyn = (nazwa) => sledz(nazwa, { getItem: () => null, setItem() {}, removeItem() {} });
  const cel = {
    VildaPersistence: sledz('VildaPersistence', {
      readModuleJSON: () => [], writeModuleJSON: () => true, getTabId: () => 'fikcyjna-karta-1',
    }),
    sessionStorage: magazyn('sessionStorage'),
    localStorage: magazyn('localStorage'),
    BroadcastChannel: sledz('BroadcastChannel', class { constructor(n) { this.n = n; } postMessage() {} close() {} }),
    addEventListener: sledz('addEventListener', function () {}),
    removeEventListener: sledz('removeEventListener', function () {}),
    document: sledz('document', { dispatchEvent: () => true }),
    CustomEvent: sledz('CustomEvent', class { constructor(t, i) { this.type = t; this.detail = i && i.detail; } }),
    indexedDB: sledz('indexedDB', { open() {} }),
    setTimeout: sledz('setTimeout', function () { return 0; }),
    setInterval: sledz('setInterval', function () { return 0; }),
  };
  const poczatkowe = Object.keys(cel);
  const okno = new Proxy(cel, {
    get(t, k, r) { if (OBSERWOWANE.includes(k)) uzycia.push(`okno.${k}`); return Reflect.get(t, k, r); },
    has(t, k) { if (OBSERWOWANE.includes(k)) uzycia.push(`${String(k)} in okno`); return Reflect.has(t, k); },
    set(t, k, v, r) { if (!DEFINIOWANE.includes(k)) uzycia.push(`okno.${String(k)} =`); return Reflect.set(t, k, v, r); },
  });
  return { okno, cel, uzycia, poczatkowe };
}

describe('Brak skutków przy ładowaniu', () => {
  it('samo załadowanie: 0 użyć magazynu, VildaPersistence, BroadcastChannel, addEventListener, dokumentu i timerów; okno dostaje tylko obiekty modułów', () => {
    const { okno, cel, uzycia, poczatkowe } = oknoRejestrujace();

    loadBrowserScript('vilda_gh_punkty.js', okno);

    expect(uzycia).toEqual([]);
    expect(Object.keys(cel)).toEqual([...poczatkowe, ...DEFINIOWANE]);
    expect(Object.isFrozen(cel.VildaGhPunkty)).toBe(true);
  });

  it('funkcje czyste wołane w tym oknie też niczego nie używają (VildaGhDawka czytany jest dozwolony)', () => {
    const { okno, uzycia } = oknoRejestrujace();
    loadBrowserScript('vilda_gh_punkty.js', okno);
    const P = okno.VildaGhPunkty;
    const lista = [structuredClone(WLACZENIE), structuredClone(KONTYNUACJA)];

    P.normalizujWiek(10, 14);
    P.wiekLacznieMies(10, 2);
    P.sprawdzRodzaj(lista, 'start', { pomin: null });
    P.dostepneRodzaje(lista);
    P.sprawdzWartosci({ lata: 9, miesiace: 6, masa: 32, wzrost: 133, dawka: 0.96, preparat: 'X', program: 'Y' }, 'karta');
    P.jednostkaDawki('Ngenla 60 mg');
    P.dniIgf(250, null, 'mg/kg/tydz');
    const wynik = P.polaZPodawanej({ ...POLA_FORMULARZA, preparat: 'Increlex 40 mg', program: 'IGF-1' }, 'wsteczny');
    P.punkt(P.noweId(), wynik.pola);
    P.zmienWMiejscu(lista, 'fikc-kont', wynik.pola);

    expect(wynik.pola.doseAbs).toBe(1.92);
    expect(uzycia).toEqual([]);
  });

  it('kontrola dziennika: wczytaj() i zapisz() w tym samym oknie są widoczne (atrapa rejestruje naprawdę)', () => {
    const { okno, uzycia } = oknoRejestrujace();
    loadBrowserScript('vilda_gh_punkty.js', okno);

    okno.VildaGhPunkty.wczytaj();
    expect(uzycia).toContain('okno.VildaPersistence');
    expect(uzycia).toContain('VildaPersistence.readModuleJSON');

    okno.VildaGhPunkty.zapisz([]);
    expect(uzycia).toContain('VildaPersistence.writeModuleJSON');
    expect(uzycia).toContain('document.dispatchEvent');
    expect(uzycia).toContain('new BroadcastChannel');
    expect(uzycia).toContain('addEventListener()');
  });
});

describe('Strażnik czystości (fn.toString())', () => {
  // Funkcje czyste z nagłówka modułu; noweId dopisane, bo też nie może sięgać do magazynu ani DOM.
  const CZYSTE = ['normalizujWiek', 'wiekLacznieMies', 'sprawdzRodzaj', 'dostepneRodzaje', 'sprawdzWartosci',
    'jednostkaDawki', 'dniIgf', 'polaZPodawanej', 'punkt', 'zmienWMiejscu', 'noweId'];
  const ZAKAZANE = ['document', 'sessionStorage', 'localStorage', 'VildaPersistence'];

  it.each(CZYSTE)('%s: źródło bez document, sessionStorage, localStorage i VildaPersistence', (nazwa) => {
    expect(typeof A[nazwa]).toBe('function');
    const zrodlo = A[nazwa].toString();
    for (const slowo of ZAKAZANE) expect(zrodlo, `${nazwa} → ${slowo}`).not.toContain(slowo);
  });
});

describe('normalizujWiek i wiekLacznieMies', () => {
  // round(lata × 12 + miesiące), potem lata = floor(/12), miesiące = reszta 0–11 — tylko gdy obie wartości są liczbami
  // skończonymi; inaczej obie wracają bez zmian (monitor: He, ghAddRetroPoint).
  it.each([
    [10, 14, 11, 2],
    [10, 24, 12, 0],
    [10, 0, 10, 0],
    [9.5, 0, 9, 6],
    [10, 2.6, 10, 3],
    [10, 0.5, 10, 1], // Math.round(120,5) = 121
    [10, -0.5, 10, 0], // Math.round(119,5) = 120
    [10, -1, 9, 11],
    [-1, 14, 0, 2],
    [0, -3, -1, 9],
    [-1, 0, -1, 0],
    [0, 0, 0, 0],
  ])('%d l. %d mies. → %d l. %d mies.', (lata, miesiace, l, m) => {
    const wynik = A.normalizujWiek(lata, miesiace);
    expect(wynik).toEqual({ lata: l, miesiace: m });
    expect(Number.isInteger(wynik.lata) && Number.isInteger(wynik.miesiace)).toBe(true);
  });

  it('wartości niepełne (NaN, brak, nieskończoność) wracają bez zmian', () => {
    for (const [lata, miesiace] of [[NaN, 5], [10, NaN], [undefined, 3], [10, undefined], [Infinity, 0], [10, -Infinity]]) {
      const wynik = A.normalizujWiek(lata, miesiace);
      expect(Object.keys(wynik)).toEqual(['lata', 'miesiace']);
      expect(Object.is(wynik.lata, lata) && Object.is(wynik.miesiace, miesiace), `${lata}/${miesiace}`).toBe(true);
    }
  });

  it('wiekLacznieMies: lata × 12 + miesiące; lata nieliczbowe → NaN, miesiące nieliczbowe liczą się jak 0', () => {
    expect(A.wiekLacznieMies(10, 6)).toBe(126);
    expect(A.wiekLacznieMies(9.5, 0)).toBe(114);
    expect(A.wiekLacznieMies(0, 0)).toBe(0);
    expect(A.wiekLacznieMies(0, -1)).toBe(-1);
    expect(A.wiekLacznieMies(10, NaN)).toBe(120);
    expect(A.wiekLacznieMies(10, undefined)).toBe(120);
    expect(A.wiekLacznieMies(NaN, 6)).toBeNaN();
    expect(A.wiekLacznieMies(undefined, 6)).toBeNaN();
  });
});

describe('sprawdzRodzaj — najwyżej jedno Włączenie i jedno Zakończenie', () => {
  const lista = [WLACZENIE, KONTYNUACJA, ZAKONCZENIE];

  it('drugie Włączenie i drugie Zakończenie: odmowa z kodem i tekstem monitora; Kontynuacja zawsze przechodzi', () => {
    expect(A.sprawdzRodzaj(lista, 'start')).toEqual({ ok: false, kod: 'drugie-wlaczenie', komunikat: DRUGIE_WLACZENIE });
    expect(A.sprawdzRodzaj(lista, 'end')).toEqual({ ok: false, kod: 'drugie-zakonczenie', komunikat: DRUGIE_ZAKONCZENIE });
    expect(A.sprawdzRodzaj(lista, 'continue')).toEqual({ ok: true });
  });

  it('pusta lista, lista bez danego rodzaju i brak listy: zgoda', () => {
    expect(A.sprawdzRodzaj([], 'start')).toEqual({ ok: true });
    expect(A.sprawdzRodzaj([ZAKONCZENIE], 'start')).toEqual({ ok: true });
    expect(A.sprawdzRodzaj([WLACZENIE], 'end')).toEqual({ ok: true });
    expect(A.sprawdzRodzaj(null, 'start')).toEqual({ ok: true });
    expect(A.sprawdzRodzaj(undefined, 'end')).toEqual({ ok: true });
  });

  it('bez klucza pomin nie ma wykluczeń (punkt wsteczny): istniejące Włączenie blokuje, także o id „null”', () => {
    expect(A.sprawdzRodzaj([WLACZENIE], 'start').ok).toBe(false);
    expect(A.sprawdzRodzaj([WLACZENIE], 'start', {}).ok).toBe(false);
    expect(A.sprawdzRodzaj([{ ...WLACZENIE, id: 'null' }], 'start').kod).toBe('drugie-wlaczenie');
  });

  it('pomin = id edytowanego punktu (edycja): sam punkt nie blokuje swojego rodzaju; porównanie po String(id)', () => {
    expect(A.sprawdzRodzaj(lista, 'start', { pomin: 'fikc-start' })).toEqual({ ok: true });
    expect(A.sprawdzRodzaj(lista, 'end', { pomin: 'fikc-koniec' })).toEqual({ ok: true });
    // Edycja Kontynuacji na Włączenie dalej blokowana przez istniejące Włączenie.
    expect(A.sprawdzRodzaj(lista, 'start', { pomin: 'fikc-kont' }).kod).toBe('drugie-wlaczenie');
    // id liczbowe i napisowe są równe po String().
    expect(A.sprawdzRodzaj([{ ...WLACZENIE, id: 123 }], 'start', { pomin: '123' })).toEqual({ ok: true });
    expect(A.sprawdzRodzaj([{ ...WLACZENIE, id: '123' }], 'start', { pomin: 123 })).toEqual({ ok: true });
    // Dwa Włączenia (np. po scaleniu): pominięte jest tylko edytowane, drugie dalej blokuje.
    expect(A.sprawdzRodzaj([WLACZENIE, { ...WLACZENIE, id: 'fikc-start-2' }], 'start', { pomin: 'fikc-start' }).kod)
      .toBe('drugie-wlaczenie');
  });

  it('pomin = null (nowy punkt z karty, x == null w monitorze) wyklucza punkt o id „null” — dziwactwo monitora, stan obecny', () => {
    // Monitor: String(c.id) !== String(x) przy x = null, czyli porównanie z napisem 'null'.
    expect(A.sprawdzRodzaj([{ ...WLACZENIE, id: 'null' }], 'start', { pomin: null })).toEqual({ ok: true });
    expect(A.sprawdzRodzaj([{ ...ZAKONCZENIE, id: 'null' }], 'end', { pomin: null })).toEqual({ ok: true });
    // Inne id dalej blokuje.
    expect(A.sprawdzRodzaj([WLACZENIE], 'start', { pomin: null })).toEqual({
      ok: false, kod: 'drugie-wlaczenie', komunikat: DRUGIE_WLACZENIE,
    });
  });

  it('pusty wpis (null) na liście: wyjątek tam, gdzie monitor (some na c.type), i tylko przy Włączeniu i Zakończeniu (P-GH-PUNKTY-API rata 2)', () => {
    expect(() => A.sprawdzRodzaj([null], 'start')).toThrow(TypeError);
    expect(() => A.sprawdzRodzaj([KONTYNUACJA, null], 'end', { pomin: 'fikc-kont' })).toThrow(TypeError);
    // Kontynuacja nie przegląda listy; Włączenie stojące przed null kończy przegląd odmową, zanim dojdzie do null.
    expect(A.sprawdzRodzaj([null], 'continue')).toEqual({ ok: true });
    expect(A.sprawdzRodzaj([WLACZENIE, null], 'start').kod).toBe('drugie-wlaczenie');
    // Wpis niebędący obiektem nie rzuca (jak monitor): (5).type to undefined.
    expect(A.sprawdzRodzaj([5, 'x', true], 'start')).toEqual({ ok: true });
  });
});

describe('dostepneRodzaje — formularz wstecznego punktu (ghRetroSyncTypeOptions)', () => {
  it.each([
    ['pusta lista', [], { start: true, end: true, domyslny: 'start' }],
    ['tylko Kontynuacja', [KONTYNUACJA], { start: true, end: true, domyslny: 'start' }],
    ['jest Włączenie', [WLACZENIE, KONTYNUACJA], { start: false, end: true, domyslny: 'continue' }],
    ['Włączenie i Zakończenie', [WLACZENIE, ZAKONCZENIE], { start: false, end: false, domyslny: 'continue' }],
    ['samo Zakończenie', [ZAKONCZENIE], { start: true, end: false, domyslny: 'start' }],
    ['brak listy', null, { start: true, end: true, domyslny: 'start' }],
    ['puste wpisy w liście', [null, WLACZENIE, undefined], { start: false, end: true, domyslny: 'continue' }],
  ])('%s', (_opis, lista, oczekiwany) => {
    expect(A.dostepneRodzaje(lista)).toEqual(oczekiwany);
  });
});

describe('sprawdzWartosci — warunki i kolejność jak w monitorze', () => {
  const OK = { lata: 9, miesiace: 6, masa: 32, wzrost: 133, dawka: 0.96, preparat: 'Omnitrope 10 mg', program: 'SNP' };

  it('poprawne wartości: { ok: true } w obu formularzach; bez górnych granic; wiek 0 l. 3 mies. przechodzi', () => {
    expect(A.sprawdzWartosci(OK, 'karta')).toEqual({ ok: true });
    expect(A.sprawdzWartosci(OK, 'wsteczny')).toEqual({ ok: true });
    expect(A.sprawdzWartosci({ ...OK, lata: 120, masa: 400, wzrost: 300, dawka: 50 }, 'karta')).toEqual({ ok: true });
    expect(A.sprawdzWartosci({ ...OK, lata: 0, miesiace: 3 }, 'karta')).toEqual({ ok: true });
    // Wzór h monitora: miesiące nieliczbowe liczą się jak 0.
    expect(A.sprawdzWartosci({ ...OK, miesiace: NaN }, 'karta')).toEqual({ ok: true });
  });

  it.each([
    ['wiek (lata) NaN', { lata: NaN }],
    ['wiek (lata) brak', { lata: undefined }],
    ['wiek (lata) nieskończony', { lata: Infinity }],
    ['masa NaN', { masa: NaN }],
    ['wzrost NaN', { wzrost: NaN }],
    ['dawka NaN', { dawka: NaN }],
    ['dawka brak', { dawka: undefined }],
    ['wiek 0 l. 0 mies.', { lata: 0, miesiace: 0 }],
    ['wiek łącznie ujemny', { lata: 0, miesiace: -1 }],
    ['masa 0', { masa: 0 }],
    ['masa ujemna', { masa: -1 }],
    ['wzrost 0', { wzrost: 0 }],
    ['wzrost ujemny', { wzrost: -1 }],
    ['dawka 0', { dawka: 0 }],
    ['dawka ujemna', { dawka: -1 }],
  ])('%s → odmowa „wartosci” (ten sam tekst w karcie i we wstecznym)', (_opis, zmiana) => {
    expect(A.sprawdzWartosci({ ...OK, ...zmiana }, 'karta')).toEqual(ODMOWA_DANE);
    expect(A.sprawdzWartosci({ ...OK, ...zmiana }, 'wsteczny')).toEqual(ODMOWA_DANE);
  });

  it.each([
    ['pusty preparat', { preparat: '' }],
    ['brak preparatu', { preparat: null }],
    ['preparat ze spacji', { preparat: '   ' }],
    ['pusty program', { program: '' }],
    ['brak programu', { program: null }],
    ['program ze spacji', { program: ' ' }],
    ['brak obu', { preparat: undefined, program: undefined }],
  ])('%s → odmowa „program-preparat” z tekstem zależnym od formularza', (_opis, zmiana) => {
    expect(A.sprawdzWartosci({ ...OK, ...zmiana }, 'karta'))
      .toEqual({ ok: false, kod: 'program-preparat', komunikat: PROGRAM_KARTA });
    expect(A.sprawdzWartosci({ ...OK, ...zmiana }, 'wsteczny'))
      .toEqual({ ok: false, kod: 'program-preparat', komunikat: PROGRAM_WSTECZNY });
    // Bez formularza: wariant karty (karta i edycja).
    expect(A.sprawdzWartosci({ ...OK, ...zmiana })).toEqual({ ok: false, kod: 'program-preparat', komunikat: PROGRAM_KARTA });
  });

  it('kolejność: wartości sprawdzane przed programem i preparatem', () => {
    expect(A.sprawdzWartosci({ ...OK, masa: 0, program: '' }, 'wsteczny')).toEqual(ODMOWA_DANE);
    expect(A.sprawdzWartosci({ ...OK, dawka: NaN, preparat: '' }, 'karta')).toEqual(ODMOWA_DANE);
    expect(A.sprawdzWartosci({ ...OK, lata: 0, miesiace: 0, preparat: null, program: null }, 'wsteczny')).toEqual(ODMOWA_DANE);
  });
});

describe('jednostkaDawki i dniIgf', () => {
  it.each([
    ['Ngenla 60 mg', 'mg/kg/tydz'],
    ['Ngenla 24 mg', 'mg/kg/tydz'],
    ['Ngenla', 'mg/kg/tydz'],
    // Z rozróżnieniem wielkości liter i od początku napisu, jak /^Ngenla/ w monitorze.
    ['ngenla 60 mg', 'mg/kg/d'],
    ['NGENLA 60 MG', 'mg/kg/d'],
    [' Ngenla 60 mg', 'mg/kg/d'],
    ['Omnitrope 10 mg', 'mg/kg/d'],
    ['Genotropin 12 mg', 'mg/kg/d'],
    ['Increlex 40 mg', 'mg/kg/d'],
    ['', 'mg/kg/d'],
    [null, 'mg/kg/d'],
    [undefined, 'mg/kg/d'],
  ])('jednostkaDawki(%s) → %s', (preparat, jednostka) => {
    expect(A.jednostkaDawki(preparat)).toBe(jednostka);
  });

  it.each([
    ['IGF bez dni, tygodniowa → 4', 250, null, 'mg/kg/tydz', 4],
    ['IGF bez dni (undefined), tygodniowa → 4', 250, undefined, 'mg/kg/tydz', 4],
    ['IGF 0 to też wartość → 4', 0, null, 'mg/kg/tydz', 4],
    ['jednostka bez rozróżniania wielkości liter → 4', 250, null, 'MG/KG/TYDZ', 4],
    ['IGF bez dni, dobowa → null', 250, null, 'mg/kg/d', null],
    ['IGF bez dni, brak jednostki → null', 250, null, undefined, null],
    ['IGF z dniami, tygodniowa → dni bez zmian', 250, 2, 'mg/kg/tydz', 2],
    ['IGF z dniami 0, tygodniowa → 0', 250, 0, 'mg/kg/tydz', 0],
    ['bez IGF i bez dni, tygodniowa → null', null, null, 'mg/kg/tydz', null],
    ['dni bez IGF, tygodniowa → dni bez zmian', null, 3, 'mg/kg/tydz', 3],
    ['dni bez IGF, dobowa → dni bez zmian', null, 3, 'mg/kg/d', 3],
  ])('dniIgf: %s', (_opis, igf1, dni, jednostka, wynik) => {
    expect(A.dniIgf(igf1, dni, jednostka)).toBe(wynik);
  });
});

describe('polaZPodawanej — dawka na kg i dawka dobowa z dawki podawanej', () => {
  const liczbowe = (zmiana) => ({
    typ: 'continue', lata: 9, miesiace: 6, masa: 32, wzrost: 133, wiekKostny: null, igf1: null, dniIgf: null,
    program: 'SNP', ...zmiana,
  });

  it('Omnitrope 10 mg, podawana 1,1 mg/d, 32 kg → dose 0,034375 mg/kg/d, doseAbs 1,1 mg/d', () => {
    const wynik = A.polaZPodawanej(liczbowe({ preparat: 'Omnitrope 10 mg', podawana: 1.1 }), 'wsteczny');

    expect(wynik.ok).toBe(true);
    expect(wynik.bezModuluDawki).toBe(false);
    oczekujRekordu(wynik.pola, {
      type: 'continue', ageYears: 9, ageMonths: 6, weight: 32, height: 133, boneAge: null, dose: 0.034375,
      doseUnit: 'mg/kg/d', drug: 'Omnitrope 10 mg', program: 'SNP', igf1: null, igf1Unit: 'ng/mL',
      igf1DaysSinceDose: null, doseAbs: 1.1,
    }, 'Omnitrope');
  });

  it('Ngenla 60 mg, 14 mg/tydz, 33 kg → dose 14/33 = 0,4242… mg/kg/tydz, doseAbs 14/7 = 2 mg/d', () => {
    const wynik = A.polaZPodawanej(liczbowe({ preparat: 'Ngenla 60 mg', podawana: 14, masa: 33 }), 'wsteczny');

    expect(wynik.ok).toBe(true);
    expect(wynik.pola.dose).toBe(14 / 33);
    expect(wynik.pola.dose).toBeCloseTo(0.4242, 4);
    expect(wynik.pola.doseAbs).toBe(2);
    expect(wynik.pola.doseUnit).toBe('mg/kg/tydz');
    expect(wynik.pola.weight).toBe(33);
    expect(wynik.bezModuluDawki).toBe(false);
  });

  it('Ngenla 60 mg, 24 mg/tydz, 32 kg → dose 0,75, doseAbs 24/7 bez zaokrąglania (jak edycja w monitorze)', () => {
    const wynik = A.polaZPodawanej(liczbowe({ preparat: 'Ngenla 60 mg', podawana: 24 }), 'karta');
    expect(wynik.pola.dose).toBe(0.75);
    expect(wynik.pola.doseAbs).toBe(3.4285714285714284);
  });

  it('Increlex 40 mg, 0,5 mg na podanie, 30 kg → dobowa 2 × 0,5 = 1 mg/d: dose 1/30 mg/kg/d, doseAbs 1', () => {
    const wynik = A.polaZPodawanej(liczbowe({ preparat: 'Increlex 40 mg', program: 'IGF-1', podawana: 0.5, masa: 30 }), 'wsteczny');

    expect(wynik.ok).toBe(true);
    expect(wynik.bezModuluDawki).toBe(false);
    expect(wynik.pola.dose).toBe(1 / 30);
    expect(wynik.pola.dose).toBeCloseTo(0.0333, 4);
    expect(wynik.pola.doseAbs).toBe(1);
    expect(wynik.pola.doseUnit).toBe('mg/kg/d');
    expect(wynik.pola.program).toBe('IGF-1');
    // Moduł dawki podany jawnie w opcjach daje to samo.
    expect(A.polaZPodawanej(liczbowe({ preparat: 'Increlex 40 mg', program: 'IGF-1', podawana: 0.5, masa: 30 }), 'wsteczny',
      { dawka: w.VildaGhDawka })).toEqual(wynik);
  });

  it('Increlex z opcje { dawka: null } → bez × 2: dose 0,5/30, doseAbs 0,5, bezModuluDawki: true — stan obecny (PR-6 do decyzji)', () => {
    const wynik = A.polaZPodawanej(liczbowe({ preparat: 'Increlex 40 mg', program: 'IGF-1', podawana: 0.5, masa: 30 }), 'wsteczny',
      { dawka: null });

    expect(wynik.ok).toBe(true);
    expect(wynik.bezModuluDawki).toBe(true);
    expect(wynik.pola.dose).toBe(0.5 / 30);
    expect(wynik.pola.dose).toBeCloseTo(0.01667, 5);
    expect(wynik.pola.doseAbs).toBe(0.5);
  });

  it('okno bez VildaGhDawka: Increlex liczy się jak monitor bez modułu dawki (1 mg przy 25 kg → 0,04 i 1), z flagą; wstrzyknięty moduł przywraca × 2', () => {
    const o = oknoBezModuluDawki();
    expect(o.VildaGhDawka).toBeUndefined();
    const we = liczbowe({ preparat: 'Increlex 40 mg', program: 'IGF-1', podawana: 1, masa: 25 });

    const bez = o.VildaGhPunkty.polaZPodawanej(we, 'wsteczny');
    expect(bez.bezModuluDawki).toBe(true);
    expect([bez.pola.dose, bez.pola.doseUnit, bez.pola.doseAbs]).toEqual([0.04, 'mg/kg/d', 1]);

    const zModulem = o.VildaGhPunkty.polaZPodawanej(we, 'wsteczny', { dawka: w.VildaGhDawka });
    expect(zModulem.bezModuluDawki).toBe(false);
    expect([zModulem.pola.dose, zModulem.pola.doseAbs]).toEqual([0.08, 2]);

    // Preparat dobowy i tygodniowy nie zależą od modułu dawki (zmienia się tylko flaga).
    const omn = o.VildaGhPunkty.polaZPodawanej(liczbowe({ preparat: 'Omnitrope 10 mg', podawana: 1.1 }), 'wsteczny');
    expect([omn.pola.dose, omn.pola.doseAbs, omn.bezModuluDawki]).toEqual([0.034375, 1.1, true]);
    const ng = o.VildaGhPunkty.polaZPodawanej(liczbowe({ preparat: 'Ngenla 60 mg', podawana: 14, masa: 33 }), 'wsteczny');
    expect([ng.pola.dose, ng.pola.doseAbs, ng.bezModuluDawki]).toEqual([14 / 33, 2, true]);
  });

  it('opcje.dawka ma jedno znaczenie: true = moduł z okna (jak gotowe), obiekt bez preparat = brak modułu; × 2 i flaga zawsze razem', () => {
    const we = liczbowe({ preparat: 'Increlex 40 mg', program: 'IGF-1', podawana: 0.5, masa: 30 });
    const zWynik = (r) => [r.pola.dose, r.pola.doseAbs, r.bezModuluDawki];
    const Z_MODULEM = [1 / 30, 1, false];
    const BEZ_MODULU = [0.5 / 30, 0.5, true];

    // Ten sam obiekt opcji co dla gotowe({dawka:true}) — liczy z modułem okna.
    expect(zWynik(A.polaZPodawanej(we, 'wsteczny', { dawka: true }))).toEqual(Z_MODULEM);
    expect(zWynik(A.polaZPodawanej(we, 'wsteczny', { dawka: w.VildaGhDawka }))).toEqual(Z_MODULEM);
    for (const dawka of [null, false, {}, { preparat: 'nie funkcja' }]) {
      expect(zWynik(A.polaZPodawanej(we, 'wsteczny', { dawka })), JSON.stringify(dawka)).toEqual(BEZ_MODULU);
    }

    // Okno z modułem dawki bez funkcji preparat: bez × 2 i z flagą (wcześniej flaga mówiła „moduł jest”).
    const o = oknoBezModuluDawki();
    o.VildaGhDawka = {};
    expect(zWynik(o.VildaGhPunkty.polaZPodawanej(we, 'wsteczny'))).toEqual(BEZ_MODULU);
    expect(zWynik(o.VildaGhPunkty.polaZPodawanej(we, 'wsteczny', { dawka: true }))).toEqual(BEZ_MODULU);
    // Jawnie wstrzyknięty moduł działa także wtedy, gdy okno go nie ma.
    expect(zWynik(o.VildaGhPunkty.polaZPodawanej(we, 'wsteczny', { dawka: w.VildaGhDawka }))).toEqual(Z_MODULEM);
  });
});

describe('polaZPodawanej — wartości pól jako napisy, czytane jak w monitorze', () => {
  const zPol = (zmiana, formularz = 'wsteczny') => A.polaZPodawanej({ ...POLA_FORMULARZA, ...zmiana }, formularz);

  it('pełny rekord z pól formularza: 14 kluczy bez id, w kolejności KLUCZE', () => {
    const wynik = zPol({});

    expect(Object.keys(wynik)).toEqual(['ok', 'bezModuluDawki', 'pola']);
    expect(wynik.ok).toBe(true);
    expect(Object.keys(wynik.pola)).toEqual(KLUCZE.slice(1));
    oczekujRekordu(wynik.pola, POLA_OCZEKIWANE, 'pola formularza');
  });

  it('napisy i liczby dają ten sam wynik (parseFloat)', () => {
    const liczby = {
      ...POLA_FORMULARZA, lata: 9, miesiace: 6, masa: 32, wzrost: 133, wiekKostny: null, podawana: 0.96, igf1: null,
      dniIgf: null,
    };
    expect(A.polaZPodawanej(liczby, 'wsteczny')).toEqual(zPol({}));
  });

  it('wiek: „10”/„14” → 11 l. 2 mies.; puste miesiące → 0; „9.5”/„0” → 9 l. 6 mies.; „-1”/„14” → 0 l. 2 mies. (przechodzi)', () => {
    expect(zPol({ lata: '10', miesiace: '14' }).pola).toMatchObject({ ageYears: 11, ageMonths: 2 });
    expect(zPol({ lata: '10', miesiace: '' }).pola).toMatchObject({ ageYears: 10, ageMonths: 0 });
    expect(zPol({ lata: '10', miesiace: undefined }).pola).toMatchObject({ ageYears: 10, ageMonths: 0 });
    expect(zPol({ lata: '9.5', miesiace: '0' }).pola).toMatchObject({ ageYears: 9, ageMonths: 6 });
    expect(zPol({ lata: '10', miesiace: '-1' }).pola).toMatchObject({ ageYears: 9, ageMonths: 11 });
    expect(zPol({ lata: '-1', miesiace: '14' }).pola).toMatchObject({ ageYears: 0, ageMonths: 2 });
    expect(zPol({ lata: '0', miesiace: '3' }).pola).toMatchObject({ ageYears: 0, ageMonths: 3 });
  });

  it('wiek kostny: pusty → null, „8.5” → 8,5, „0” → 0, nieliczbowy → null', () => {
    expect(zPol({ wiekKostny: '' }).pola.boneAge).toBeNull();
    expect(zPol({ wiekKostny: undefined }).pola.boneAge).toBeNull();
    expect(zPol({ wiekKostny: '8.5' }).pola.boneAge).toBe(8.5);
    expect(zPol({ wiekKostny: '0' }).pola.boneAge).toBe(0);
    expect(zPol({ wiekKostny: 'x' }).pola.boneAge).toBeNull();
  });

  it('IGF-1: pusty → null; „250” bez dni przy Ngenli → 4 dni, przy preparacie dobowym → null; „0” dni zostaje; dni bez IGF zostają', () => {
    const ngenla = { preparat: 'Ngenla 24 mg', podawana: '14' };
    expect(zPol({}).pola).toMatchObject({ igf1: null, igf1Unit: 'ng/mL', igf1DaysSinceDose: null });
    expect(zPol({ ...ngenla, igf1: '250' }).pola).toMatchObject({
      igf1: 250, igf1DaysSinceDose: 4, dose: 0.4375, doseUnit: 'mg/kg/tydz', doseAbs: 2,
    });
    expect(zPol({ igf1: '250' }).pola).toMatchObject({ igf1: 250, igf1DaysSinceDose: null, doseUnit: 'mg/kg/d' });
    expect(zPol({ ...ngenla, igf1: '250', dniIgf: '0' }).pola.igf1DaysSinceDose).toBe(0);
    expect(zPol({ ...ngenla, igf1: '250', dniIgf: '2' }).pola.igf1DaysSinceDose).toBe(2);
    expect(zPol({ ...ngenla, igf1: '', dniIgf: '3' }).pola).toMatchObject({ igf1: null, igf1DaysSinceDose: 3 });
  });

  it('typ przechodzi bez zmian (start, continue, end)', () => {
    for (const typ of ['start', 'continue', 'end']) expect(zPol({ typ }).pola.type).toBe(typ);
  });

  it.each([
    ['pusty wiek', { lata: '' }],
    ['wiek 0 l. 0 mies.', { lata: '0', miesiace: '0' }],
    ['pusta masa', { masa: '' }],
    ['masa 0', { masa: '0' }],
    ['pusty wzrost', { wzrost: '' }],
    ['wzrost ujemny', { wzrost: '-1' }],
    ['pusta dawka', { podawana: '' }],
    ['dawka 0', { podawana: '0' }],
    ['dawka ujemna', { podawana: '-1' }],
    ['masa 0 i pusty program (najpierw wartości)', { masa: '0', program: '' }],
  ])('%s → odmowa „wartosci”, bez pól', (_opis, zmiana) => {
    expect(zPol(zmiana, 'wsteczny')).toEqual(ODMOWA_DANE);
    expect(zPol(zmiana, 'karta')).toEqual(ODMOWA_DANE);
  });

  it('pusty program albo preparat → odmowa z tekstem formularza (wsteczny / karta)', () => {
    for (const zmiana of [{ program: '' }, { program: null }, { preparat: '' }, { preparat: null }]) {
      expect(zPol(zmiana, 'wsteczny'), JSON.stringify(zmiana))
        .toEqual({ ok: false, kod: 'program-preparat', komunikat: PROGRAM_WSTECZNY });
      expect(zPol(zmiana, 'karta'), JSON.stringify(zmiana))
        .toEqual({ ok: false, kod: 'program-preparat', komunikat: PROGRAM_KARTA });
    }
  });
});

describe('noweId', () => {
  afterEach(() => { vi.restoreAllMocks(); });

  it('format String(Date.now() + Math.random()), jak id nowego punktu w monitorze', () => {
    vi.spyOn(Date, 'now').mockReturnValue(Date.UTC(2026, 0, 1));
    vi.spyOn(Math, 'random').mockReturnValue(0.25);

    expect(A.noweId()).toBe('1767225600000.25');
    expect(A.noweId()).toBe(String(Date.now() + Math.random()));
  });

  it('bez atrap: napis liczbowy z bieżącego czasu, kolejne wywołania różne', () => {
    const przed = Date.now();
    const id = A.noweId();
    const po = Date.now();

    expect(typeof id).toBe('string');
    expect(id).toMatch(/^\d+(\.\d+)?$/);
    expect(Number(id)).toBeGreaterThanOrEqual(przed);
    expect(Number(id)).toBeLessThan(po + 1);
    expect(A.noweId()).not.toBe(id);
  });
});

describe('punkt(id, pola) — rekord 15 kluczy', () => {
  it('Object.keys dokładnie w kolejności KLUCZE: id na początku, doseAbs na końcu', () => {
    const pola = A.polaZPodawanej(POLA_FORMULARZA, 'wsteczny').pola;

    const p = A.punkt('fikc-1', pola);

    expect(Object.keys(p)).toEqual(KLUCZE);
    oczekujRekordu(p, { id: 'fikc-1', ...POLA_OCZEKIWANE }, 'punkt');
  });

  it('pola w innej kolejności, z obcym polem i z własnym id: wynik w kolejności KLUCZE, id z argumentu, bez obcego pola', () => {
    const odwrocone = Object.fromEntries(Object.entries({ ...POLA_OCZEKIWANE }).reverse());
    const pola = { notatkaTestowa: 'fikcyjne obce pole', id: 'obce-id', ...odwrocone };
    const kopia = structuredClone(pola);

    const p = A.punkt('fikc-2', pola);

    expect(Object.keys(p)).toEqual(KLUCZE);
    expect(p).toStrictEqual({ id: 'fikc-2', ...POLA_OCZEKIWANE });
    // pola bez zmian, wynik to nowy obiekt.
    expect(pola).toStrictEqual(kopia);
    expect(p).not.toBe(pola);
  });

  it('punkt(noweId(), polaZPodawanej(...)) = rekord ghAddRetroPoint z testu charakteryzującego (Ngenla 60 mg, 21 mg/tydz, IGF-1 bez dni)', () => {
    const pola = A.polaZPodawanej({ ...POLA_FORMULARZA, preparat: 'Ngenla 60 mg', podawana: '21', igf1: '250' }, 'wsteczny').pola;

    const p = A.punkt('1767225600000.25', pola);

    oczekujRekordu(p, {
      id: '1767225600000.25', type: 'continue', ageYears: 9, ageMonths: 6, weight: 32, height: 133, boneAge: null,
      dose: 0.65625, doseUnit: 'mg/kg/tydz', drug: 'Ngenla 60 mg', program: 'SNP',
      igf1: 250, igf1Unit: 'ng/mL', igf1DaysSinceDose: 4, doseAbs: 3,
    }, 'Ngenla wsteczny');
  });
});

describe('zmienWMiejscu — edycja punktu w miejscu, nigdy dopisanie', () => {
  // Punkt środkowy w starym kształcie: bez doseAbs, z obcym polem w środku i z programem innym niż Włączenie
  // (ten sam co w teście charakteryzującym „Edycja istniejącego punktu”).
  const SRODKOWY = {
    id: 'fikc-srodek', type: 'continue', ageYears: 9, ageMonths: 6, notatkaTestowa: 'fikcyjne obce pole', weight: 30,
    height: 133, boneAge: 8, dose: 0.03, doseUnit: 'mg/kg/d', drug: 'Omnitrope 10 mg', program: 'PWS',
    igf1: 310, igf1Unit: 'ng/mL', igf1DaysSinceDose: null,
  };
  // Formularz edycji po zmianie masy na 32 kg i dawki na 0,96 mg/d, zapis przyciskiem „Zakończenie”, program z #therProg.
  const polaEdycji = () => A.polaZPodawanej({
    typ: 'end', lata: '9', miesiace: '6', masa: '32', wzrost: '133', wiekKostny: '8', podawana: '0.96',
    preparat: 'Omnitrope 10 mg', program: 'SNP', igf1: '310', dniIgf: '',
  }, 'karta').pola;

  it('obce pole i kolejność kluczy zostają, brakujące doseAbs dopisane na końcu; id i pozycja zostają; pozostałe punkty nietknięte', () => {
    const lista = [structuredClone(WLACZENIE), structuredClone(SRODKOWY), structuredClone(KONTYNUACJA)];
    const [p0, p1, p2] = lista;

    const wynik = A.zmienWMiejscu(lista, 'fikc-srodek', polaEdycji());

    expect(wynik).toEqual({ ok: true, indeks: 1 });
    expect(lista).toHaveLength(3);
    expect(lista[0]).toBe(p0);
    expect(lista[1]).toBe(p1);
    expect(lista[2]).toBe(p2);
    expect(lista[0]).toStrictEqual(WLACZENIE);
    expect(lista[2]).toStrictEqual(KONTYNUACJA);
    expect(Object.keys(lista[1])).toEqual([...Object.keys(SRODKOWY), 'doseAbs']);
    oczekujRekordu(lista[1], {
      ...SRODKOWY, type: 'end', weight: 32, dose: 0.03, program: 'SNP', doseAbs: 0.96,
    }, 'edycja');
  });

  it('id z pól jest pomijane; id liczbowe zostaje liczbą (dopasowanie po String(id))', () => {
    const lista = [punktFikcyjny(123, 'start'), structuredClone(KONTYNUACJA)];

    const wynik = A.zmienWMiejscu(lista, '123', { ...polaEdycji(), type: 'start', id: 'obce-id' });

    expect(wynik).toEqual({ ok: true, indeks: 0 });
    expect(lista[0].id).toBe(123);
    expect(Object.keys(lista[0])).toEqual(KLUCZE);
    expect(lista[0]).toMatchObject({ type: 'start', weight: 32, doseAbs: 0.96 });
    expect(lista[1]).toStrictEqual(KONTYNUACJA);
  });

  it('dwa punkty o tym samym id: zmienia się tylko pierwszy', () => {
    const lista = [structuredClone(WLACZENIE), punktFikcyjny('fikc-dup', 'continue'), punktFikcyjny('fikc-dup', 'continue')];

    expect(A.zmienWMiejscu(lista, 'fikc-dup', polaEdycji())).toEqual({ ok: true, indeks: 1 });
    expect(lista[1]).toMatchObject({ type: 'end', weight: 32 });
    expect(lista[2]).toStrictEqual(punktFikcyjny('fikc-dup', 'continue'));
  });

  it('brak punktu → { ok: false, kod: „brak-punktu” }; lista bez zmian (długość, referencje, treść), nic nie dopisane', () => {
    const lista = [structuredClone(WLACZENIE), structuredClone(SRODKOWY), structuredClone(KONTYNUACJA)];
    const referencje = lista.slice();
    const migawka = structuredClone(lista);

    const wynik = A.zmienWMiejscu(lista, 'fikc-nieistniejacy', polaEdycji());

    expect(wynik).toEqual({ ok: false, kod: 'brak-punktu' });
    expect(lista).toHaveLength(3);
    lista.forEach((p, i) => expect(p).toBe(referencje[i]));
    expect(lista).toStrictEqual(migawka);

    const pusta = [];
    expect(A.zmienWMiejscu(pusta, 'fikc-start', polaEdycji())).toEqual({ ok: false, kod: 'brak-punktu' });
    expect(pusta).toEqual([]);
    expect(A.zmienWMiejscu(null, 'fikc-start', polaEdycji())).toEqual({ ok: false, kod: 'brak-punktu' });
  });

  it('pusty wpis (null) PRZED szukanym punktem: wyjątek jak findIndex monitora; ZA nim: zwykła edycja (P-GH-PUNKTY-API rata 2)', () => {
    const przed = [null, { ...KONTYNUACJA }];
    expect(() => A.zmienWMiejscu(przed, 'fikc-kont', polaEdycji())).toThrow(TypeError);
    expect(przed[1]).toStrictEqual(KONTYNUACJA);

    const za = [{ ...KONTYNUACJA }, null];
    expect(A.zmienWMiejscu(za, 'fikc-kont', polaEdycji())).toEqual({ ok: true, indeks: 0 });
    expect(za[1]).toBeNull();
  });

  it('wpis niebędący obiektem (liczba, napis, true) z pasującym String(id): ok bez zmiany wpisu — jak przypisanie w monitorze bez trybu ścisłego', () => {
    for (const wpis of [5, 'x', true]) {
      const lista = [wpis, { ...KONTYNUACJA }];
      expect(A.zmienWMiejscu(lista, 'undefined', polaEdycji()), String(wpis)).toEqual({ ok: true, indeks: 0 });
      expect(lista[0]).toBe(wpis);
      expect(lista[1]).toStrictEqual(KONTYNUACJA);
    }
    // Tablica i obiekt bez id są obiektami: dostają pola jak w monitorze.
    const bezId = {};
    expect(A.zmienWMiejscu([bezId], 'undefined', polaEdycji())).toEqual({ ok: true, indeks: 0 });
    expect(Object.keys(bezId)).toEqual(KLUCZE.filter((k) => k !== 'id'));
  });
});
