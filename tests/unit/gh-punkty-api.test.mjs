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
// P-GH-WZNOWIENIE, część 2: reguła rodzaju punktu liczy kursy z VildaTrajectoryAnalysis.ghKursy (na docpro.html
// i index.html ładowany obok tego modułu).
loadBrowserScript('vilda_trajectory_analysis.js', w);
const A = w.VildaGhPunkty;

// 15 kluczy rekordu w kolejności zapisu monitora (mapa punktów GH, §1.1).
const KLUCZE = ['id', 'type', 'ageYears', 'ageMonths', 'weight', 'height', 'boneAge', 'dose', 'doseUnit', 'drug',
  'program', 'igf1', 'igf1Unit', 'igf1DaysSinceDose', 'doseAbs'];

// Komunikaty monitora dosłownie (nakładka #ghInfoOverlay, nagłówek „Informacja”). Teksty rodzaju punktu od
// P-GH-WZNOWIENIE, część 2 (reguła kursów); dawne „Punkt „Włączenie leczenia” / „Zakończenie leczenia” został już
// dodany.” zostały tylko w monitorze sprzed API (wyrocznia testów różnicowych).
const DAWNE_DRUGIE_WLACZENIE = 'Punkt „Włączenie leczenia” został już dodany.';
const DAWNE_DRUGIE_ZAKONCZENIE = 'Punkt „Zakończenie leczenia” został już dodany.';
const DRUGIE_WLACZENIE = 'Ten kurs leczenia ma już punkt „Włączenie leczenia”. Nowe Włączenie można dodać po „Zakończeniu leczenia”.';
const DRUGIE_ZAKONCZENIE = 'Ten kurs leczenia ma już punkt „Zakończenie leczenia”.';
const WLACZENIE_POZNIEJ = '„Włączenie leczenia” nie może być późniejsze niż pierwszy punkt tego kursu leczenia.';
const ZAKONCZENIE_NIE_OSTATNIE = '„Zakończenie leczenia” musi być ostatnim punktem kursu.';
const ZAKONCZENIE_BEZ_KURSU = '„Zakończenie leczenia” zamyka kurs leczenia — musi je poprzedzać co najmniej jeden punkt tego kursu.';
const KONTYNUACJA_PO_ZAKONCZENIU = 'Po „Zakończeniu leczenia” dodaj najpierw „Włączenie leczenia” (wznowienie leczenia).';
const ODSWIEZ = 'Nie zapisano: aplikacja nie wczytała się w całości. Odśwież stronę i spróbuj ponownie.';
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
  it('ładuje się z modułem dawki jako zależnością; wersja 4 (P-GH-WZNOWIENIE, część 2: reguła kursów)', () => {
    expect(A.wersja).toBe(4);
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

  it('KOMUNIKATY: teksty wartości i programu dosłownie jak w monitorze sprzed API; teksty rodzaju punktu z reguły kursów (P-GH-WZNOWIENIE, część 2)', () => {
    expect(A.KOMUNIKATY).toEqual({
      drugieWlaczenie: DRUGIE_WLACZENIE,
      drugieZakonczenie: DRUGIE_ZAKONCZENIE,
      wlaczeniePozniej: WLACZENIE_POZNIEJ,
      zakonczenieNieOstatnie: ZAKONCZENIE_NIE_OSTATNIE,
      zakonczenieBezKursu: ZAKONCZENIE_BEZ_KURSU,
      kontynuacjaPoZakonczeniu: KONTYNUACJA_PO_ZAKONCZENIU,
      wartosci: DANE,
      programKarta: PROGRAM_KARTA,
      programWsteczny: PROGRAM_WSTECZNY,
      odswiez: ODSWIEZ,
    });
    // Wzorem jest monitor sprzed API (tests/fixtures/gh-monitor-przed-api.js.txt): każdy tekst występuje w jego źródle
    // (po rozwinięciu \uXXXX). Od raty 3 (D5) dzisiejszy monitor nie ma już własnej kopii — teksty są tylko w API.
    const rozwin = (plik) => fs.readFileSync(path.join(korzen, plik), 'utf8')
      .replace(/\\u([0-9a-fA-F]{4})/g, (_, h) => String.fromCharCode(parseInt(h, 16)));
    const przedApi = rozwin('tests/fixtures/gh-monitor-przed-api.js.txt');
    const monitor = rozwin('gh_therapy_monitor.js');
    for (const tekst of [DAWNE_DRUGIE_WLACZENIE, DAWNE_DRUGIE_ZAKONCZENIE, DANE, PROGRAM_KARTA, PROGRAM_WSTECZNY]) {
      expect(przedApi, tekst).toContain(tekst);
      expect(monitor, tekst).not.toContain(tekst);
    }
    // Dawne teksty jednego Włączenia i Zakończenia na liście zniknęły z API; nowe teksty reguły kursów są tylko w API.
    for (const tekst of [DAWNE_DRUGIE_WLACZENIE, DAWNE_DRUGIE_ZAKONCZENIE]) expect(Object.values(A.KOMUNIKATY), tekst).not.toContain(tekst);
    for (const tekst of [DRUGIE_WLACZENIE, DRUGIE_ZAKONCZENIE, WLACZENIE_POZNIEJ, ZAKONCZENIE_NIE_OSTATNIE, ZAKONCZENIE_BEZ_KURSU,
      KONTYNUACJA_PO_ZAKONCZENIU]) {
      expect(przedApi, tekst).not.toContain(tekst);
      expect(monitor, tekst).not.toContain(tekst);
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
    P.wiekMiesZPol('10', '2');
    P.sprawdzRodzaj(lista, 'start', { pomin: null, wiekM: 122 });
    P.dostepneRodzaje(lista);
    P.dostepneRodzaje(lista, { wsteczny: true });
    P.sprawdzWartosci({ lata: 9, miesiace: 6, masa: 32, wzrost: 133, dawka: 0.96, preparat: 'X', program: 'Y' }, 'karta');
    P.jednostkaDawki('Ngenla 60 mg');
    P.dniIgf(250, null, 'mg/kg/tydz');
    const wynik = P.polaZPodawanej({ ...POLA_FORMULARZA, preparat: 'Increlex 40 mg', program: 'IGF-1' }, 'wsteczny');
    P.punkt(P.noweId(), wynik.pola);
    P.zmienWMiejscu(lista, 'fikc-kont', wynik.pola);
    P.uszkodzone([null, ...lista, 5]);
    P.bezUszkodzonych([null, ...lista, 5]);
    P.komunikatyUszkodzonych(2);

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
  const CZYSTE = ['normalizujWiek', 'wiekLacznieMies', 'wiekMiesZPol', 'sprawdzRodzaj', 'dostepneRodzaje', 'sprawdzWartosci',
    'jednostkaDawki', 'dniIgf', 'polaZPodawanej', 'punkt', 'zmienWMiejscu', 'noweId', 'uszkodzone', 'bezUszkodzonych',
    'komunikatyUszkodzonych'];
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

// P-GH-WZNOWIENIE, część 2 (decyzje właściciela 2026-11-20, W2): reguła KURSÓW zastępuje „najwyżej jedno Włączenie
// i jedno Zakończenie w całej liście”. Kursy liczy VildaTrajectoryAnalysis.ghKursy (punkty wg wieku, przy równym wieku
// Kontynuacja → Zakończenie → Włączenie, kurs zamyka Zakończenie). Wiek nowego punktu: opcje.wiekM w pełnych miesiącach.
// Przypadki GW1–GW7 ze specyfikacji (wiek lata;miesiące), wartości oczekiwane z reguły w ALGORITHMS.md.
const G = (id, type, lata, mies) => punktFikcyjny(id, type, { ageYears: lata, ageMonths: mies });
const W7 = G('gw-w7', 'start', 7, 0);
const K8 = G('gw-k8', 'continue', 8, 0);
const K9 = G('gw-k9', 'continue', 9, 0);
const Z9 = G('gw-z9', 'end', 9, 0);
const W10 = G('gw-w10', 'start', 10, 0);
const K10 = G('gw-k10', 'continue', 10, 0);
const K11 = G('gw-k11', 'continue', 11, 0);
const wiek = (lata, mies) => lata * 12 + mies;
// Wynik reguły: 'ok' albo kod odmowy.
const regula = (lista, typ, lata, mies, opcje = {}) => {
  const r = A.sprawdzRodzaj(lista, typ, { wiekM: wiek(lata, mies), ...opcje });
  return r.ok ? 'ok' : r.kod;
};
const ODMOWY = {
  'drugie-wlaczenie': DRUGIE_WLACZENIE,
  'wlaczenie-pozniej': WLACZENIE_POZNIEJ,
  'drugie-zakonczenie': DRUGIE_ZAKONCZENIE,
  'zakonczenie-nie-ostatnie': ZAKONCZENIE_NIE_OSTATNIE,
  'zakonczenie-bez-kursu': ZAKONCZENIE_BEZ_KURSU,
  'kontynuacja-po-zakonczeniu': KONTYNUACJA_PO_ZAKONCZENIU,
};

describe('sprawdzRodzaj — reguła kursów (P-GH-WZNOWIENIE, część 2)', () => {
  it('GW1 wznowienie: W 7;0 → K 8;0 → Z 9;0 + W 10;0 przyjęte; potem K 10;0 i K 11;0 przyjęte', () => {
    expect(regula([W7, K8, Z9], 'start', 10, 0)).toBe('ok');
    expect(regula([W7, K8, Z9, W10], 'continue', 10, 0)).toBe('ok');
    expect(regula([W7, K8, Z9, W10], 'continue', 11, 0)).toBe('ok');
    expect(regula([W7, K8, Z9, W10, K10], 'continue', 11, 0)).toBe('ok');
    // Włączenie w miesiącu Zakończenia otwiera nowy kurs (przy równym wieku Zakończenie przed Włączeniem).
    expect(regula([W7, K8, Z9], 'start', 9, 0)).toBe('ok');
  });

  it('GW2 Kontynuacja po Zakończeniu bez nowego Włączenia: odmowa z prośbą o Włączenie; w miesiącu Zakończenia — w zamykanym kursie', () => {
    expect(A.sprawdzRodzaj([W7, Z9], 'continue', { wiekM: wiek(10, 0) }))
      .toEqual({ ok: false, kod: 'kontynuacja-po-zakonczeniu', komunikat: KONTYNUACJA_PO_ZAKONCZENIU });
    // Przerwa przed wznowieniem (Kontynuacja między Zakończeniem a późniejszym Włączeniem) — też odmowa.
    expect(regula([W7, Z9, W10], 'continue', 9, 6)).toBe('kontynuacja-po-zakonczeniu');
    // Stary zapis W2 (W 7;0 → Z 9;0 → K 10;0): kolejna Kontynuacja w tym kursie — odmowa.
    expect(regula([W7, Z9, K10], 'continue', 11, 0)).toBe('kontynuacja-po-zakonczeniu');
    // Kontynuacja z miesiąca Zakończenia zostaje w zamykanym kursie (np. późny wynik IGF-1) — zgoda.
    expect(regula([W7, Z9], 'continue', 9, 0)).toBe('ok');
    // Kontynuacja w środku zamkniętego kursu i przed Włączeniem pierwszego kursu — zgoda (jak dotąd).
    expect(regula([W7, Z9], 'continue', 8, 0)).toBe('ok');
    expect(regula([W7], 'continue', 6, 0)).toBe('ok');
    // Jedyny kurs bez Włączenia (P-GH-BEZ-STARTU) — zgoda.
    expect(regula([K8], 'continue', 9, 0)).toBe('ok');
    expect(regula([], 'continue', 9, 0)).toBe('ok');
  });

  it('GW3 drugie Włączenie w kursie: W 7;0 → K 8;0 + W 9;0 albo W 6;0 (przed pierwszym punktem kursu z Włączeniem) — odmowa', () => {
    expect(A.sprawdzRodzaj([W7, K8], 'start', { wiekM: wiek(9, 0) }))
      .toEqual({ ok: false, kod: 'drugie-wlaczenie', komunikat: DRUGIE_WLACZENIE });
    expect(regula([W7, K8], 'start', 6, 0)).toBe('drugie-wlaczenie');
    expect(regula([W7, K8], 'start', 7, 0)).toBe('drugie-wlaczenie');
    // Wznowiony kurs ma już Włączenie: kolejne Włączenie w nim — odmowa.
    expect(regula([W7, Z9, W10, K11], 'start', 10, 6)).toBe('drugie-wlaczenie');
    // Włączenie w przerwie przed wznowieniem: trafia do kursu 2, który ma już Włączenie — odmowa.
    expect(regula([W7, Z9, W10], 'start', 9, 6)).toBe('drugie-wlaczenie');
  });

  it('GW4 Zakończenie: przed ostatnim punktem kursu, drugie w kursie i jako pierwszy punkt kursu — odmowa; po ostatnim — zgoda', () => {
    const L = [W7, K8, K9];
    expect(A.sprawdzRodzaj(L, 'end', { wiekM: wiek(8, 6) }))
      .toEqual({ ok: false, kod: 'zakonczenie-nie-ostatnie', komunikat: ZAKONCZENIE_NIE_OSTATNIE });
    expect(regula(L, 'end', 9, 6)).toBe('ok');
    // W miesiącu ostatniej Kontynuacji (przy równym wieku Kontynuacja przed Zakończeniem) — zgoda.
    expect(regula(L, 'end', 9, 0)).toBe('ok');
    const Z96 = G('gw-z96', 'end', 9, 6);
    expect(A.sprawdzRodzaj([...L, Z96], 'end', { wiekM: wiek(10, 0) }))
      .toEqual({ ok: false, kod: 'drugie-zakonczenie', komunikat: DRUGIE_ZAKONCZENIE });
    expect(regula([...L, Z96], 'end', 8, 0)).toBe('drugie-zakonczenie');
    // Zakończenie jako pierwszy punkt kursu po Zakończeniu (przed wznowieniem albo w kursie W2) — odmowa.
    expect(regula([W7, Z9, W10], 'end', 9, 6)).toBe('drugie-zakonczenie');
    expect(regula([W7, Z9, K10], 'end', 9, 6)).toBe('drugie-zakonczenie');
    // Zakończenie bez wcześniejszego punktu: pusta lista albo przed pierwszym punktem.
    expect(A.sprawdzRodzaj([], 'end', { wiekM: wiek(9, 0) }))
      .toEqual({ ok: false, kod: 'zakonczenie-bez-kursu', komunikat: ZAKONCZENIE_BEZ_KURSU });
    expect(regula([W7, K8], 'end', 6, 0)).toBe('zakonczenie-bez-kursu');
    // W miesiącu Włączenia (przy równym wieku Zakończenie przed Włączeniem) — bez wcześniejszego punktu.
    expect(regula([W7], 'end', 7, 0)).toBe('zakonczenie-bez-kursu');
    // Zakończenie wznowionego kursu po jego ostatnim punkcie — zgoda.
    expect(regula([W7, Z9, W10, K11], 'end', 11, 6)).toBe('ok');
    expect(regula([W7, Z9, W10, K11], 'end', 10, 6)).toBe('zakonczenie-nie-ostatnie');
  });

  it('GW5 dopisanie Włączenia do starego zapisu W2 (W 7;0 → Z 9;0 → K 10;0): W 10;0 albo 9;6 przyjęte, W 10;6 — odmowa', () => {
    const L = [W7, Z9, K10];
    expect(regula(L, 'start', 10, 0)).toBe('ok');
    expect(regula(L, 'start', 9, 6)).toBe('ok');
    expect(A.sprawdzRodzaj(L, 'start', { wiekM: wiek(10, 6) }))
      .toEqual({ ok: false, kod: 'wlaczenie-pozniej', komunikat: WLACZENIE_POZNIEJ });
    // Po dopisaniu Włączenia w miesiącu pierwszego punktu kursu Kontynuacja w tym kursie przechodzi.
    expect(regula([...L, W10], 'continue', 11, 0)).toBe('ok');
    expect(regula([...L, W10], 'continue', 10, 0)).toBe('ok');
    // Jedyny kurs bez Włączenia (P-GH-BEZ-STARTU): Włączenie nie później niż pierwszy punkt — zgoda; później — odmowa.
    expect(regula([K8, K9], 'start', 7, 0)).toBe('ok');
    expect(regula([K8, K9], 'start', 8, 0)).toBe('ok');
    expect(regula([K8, K9], 'start', 8, 6)).toBe('wlaczenie-pozniej');
    expect(regula([], 'start', 9, 0)).toBe('ok');
  });

  it('GW7 edycja (opcje.pomin): zmiana K → W w kursie z Włączeniem — odmowa; własny rodzaj edytowanego punktu nie blokuje; Z → K przy kursie 2 — ta sama symulacja', () => {
    expect(regula([W7, K8], 'start', 8, 0, { pomin: K8.id })).toBe('drugie-wlaczenie');
    expect(regula([W7, K8, Z9], 'start', 7, 0, { pomin: W7.id })).toBe('ok');
    expect(regula([W7, K8, Z9], 'end', 9, 0, { pomin: Z9.id })).toBe('ok');
    // Edycja wieku Zakończenia przed ostatnią Kontynuację — odmowa; Kontynuacji po Zakończeniu — odmowa.
    expect(regula([W7, K8, K9, G('gw-z10', 'end', 10, 0)], 'end', 8, 6, { pomin: 'gw-z10' })).toBe('zakonczenie-nie-ostatnie');
    expect(regula([W7, K8, Z9], 'continue', 9, 6, { pomin: K8.id })).toBe('kontynuacja-po-zakonczeniu');
    // Z 9;0 → K 9;0, gdy po nim jest kurs 2 (W 10;0 → K 11;0): bez Zakończenia lista to jeden kurs z Włączeniem 7;0,
    // więc Kontynuacja przechodzi (W 10;0 zostaje drugim Włączeniem w kursie, jak po scaleniu duplikatów).
    expect(regula([W7, K8, Z9, W10, K11], 'continue', 9, 0, { pomin: Z9.id })).toBe('ok');
    // W 10;0 → K 10;0 przy Z 9;0 — Kontynuacja po Zakończeniu bez Włączenia: odmowa.
    expect(regula([W7, K8, Z9, W10, K11], 'continue', 10, 0, { pomin: W10.id })).toBe('kontynuacja-po-zakonczeniu');
    // Porównanie po String(id): id liczbowe i napisowe są równe.
    expect(regula([{ ...W7, id: 123 }], 'start', 7, 0, { pomin: '123' })).toBe('ok');
    expect(regula([{ ...W7, id: '123' }], 'start', 7, 0, { pomin: 123 })).toBe('ok');
    // Dwa Włączenia (np. po scaleniu): pominięte jest tylko edytowane, drugie dalej blokuje.
    expect(regula([W7, { ...W7, id: 'gw-w7-2' }], 'start', 7, 0, { pomin: W7.id })).toBe('drugie-wlaczenie');
  });

  it('pomin = null (nowy punkt z karty, x == null w monitorze) wyklucza punkt o id „null” — dziwactwo monitora, stan obecny', () => {
    expect(regula([{ ...W7, id: 'null' }], 'start', 8, 0, { pomin: null })).toBe('ok');
    expect(regula([W7], 'start', 8, 0, { pomin: null })).toBe('drugie-wlaczenie');
    // Bez klucza pomin nie ma wykluczeń (punkt wsteczny, panel wiersza), także punktu o id „null”.
    expect(regula([{ ...W7, id: 'null' }], 'start', 8, 0)).toBe('drugie-wlaczenie');
  });

  it('wynik nie zależy od kolejności tablicy (punkty wg wieku)', () => {
    expect(regula([Z9, K8, W7], 'start', 10, 0)).toBe('ok');
    expect(regula([K9, W7, K8], 'end', 8, 6)).toBe('zakonczenie-nie-ostatnie');
    expect(regula([K10, W7, Z9], 'start', 10, 6)).toBe('wlaczenie-pozniej');
  });

  it('każdy kod odmowy niesie swój tekst z KOMUNIKATY', () => {
    const przypadki = [
      [[W7, K8], 'start', 9, 0], [[K8, K9], 'start', 8, 6], [[W7, Z9], 'end', 10, 0], [[W7, K8, K9], 'end', 8, 6],
      [[], 'end', 9, 0], [[W7, Z9], 'continue', 10, 0],
    ];
    const kody = new Set();
    for (const [lista, typ, lata, mies] of przypadki) {
      const r = A.sprawdzRodzaj(lista, typ, { wiekM: wiek(lata, mies) });
      expect(r.ok).toBe(false);
      expect(r.komunikat, r.kod).toBe(ODMOWY[r.kod]);
      kody.add(r.kod);
    }
    expect([...kody].sort()).toEqual(Object.keys(ODMOWY).sort());
  });

  it('wiek nowego punktu: bez opcje.wiekM, wiek 0, ujemny albo NaN — odmowa „wartosci” (ten sam tekst, którym odmówi sprawdzWartosci); wiek ułamkowy zaokrąglony jak w ghKursy', () => {
    expect(A.sprawdzRodzaj([], 'start')).toEqual(ODMOWA_DANE);
    expect(A.sprawdzRodzaj([], 'continue', {})).toEqual(ODMOWA_DANE);
    expect(A.sprawdzRodzaj([], 'end', { wiekM: 0 })).toEqual(ODMOWA_DANE);
    expect(A.sprawdzRodzaj([], 'start', { wiekM: -6 })).toEqual(ODMOWA_DANE);
    expect(A.sprawdzRodzaj([], 'start', { wiekM: NaN })).toEqual(ODMOWA_DANE);
    expect(A.sprawdzRodzaj([], 'start', { wiekM: '100' })).toEqual(ODMOWA_DANE);
    expect(A.sprawdzRodzaj([], 'start', { wiekM: 0.4 })).toEqual(ODMOWA_DANE);
    expect(A.sprawdzRodzaj([], 'start', { wiekM: 0.6 })).toEqual({ ok: true });
    // 9 l. 11,6 mies. = 119,6 → 120 (miesiąc Włączenia W 10;0 kursu 2 starego zapisu W2) — zgoda.
    expect(A.sprawdzRodzaj([W7, Z9, K10], 'start', { wiekM: 119.6 })).toEqual({ ok: true });
  });

  it('rodzaj spoza start/continue/end — zgoda bez sprawdzania (jak dotąd)', () => {
    expect(A.sprawdzRodzaj([W7], 'inny')).toEqual({ ok: true });
    expect(A.sprawdzRodzaj([W7], undefined)).toEqual({ ok: true });
  });

  it('wpisy niebędące obiektem (null, liczba, napis) nie są punktami — pomijane jak w ghKursy (dotąd null rzucał wyjątek tam, gdzie monitor)', () => {
    expect(regula([null], 'start', 9, 0)).toBe('ok');
    expect(regula([W7, null, 5, 'x', true], 'start', 9, 0)).toBe('drugie-wlaczenie');
    expect(regula([null, W7, Z9], 'continue', 10, 0, { pomin: 'gw-k8' })).toBe('kontynuacja-po-zakonczeniu');
    expect(regula(null, 'start', 9, 0)).toBe('ok');
    expect(regula(undefined, 'end', 9, 0)).toBe('zakonczenie-bez-kursu');
  });

  it('bez modułu kursów (VildaTrajectoryAnalysis.ghKursy) — odmowa z prośbą o odświeżenie strony, bez powrotu do dawnej reguły', () => {
    const bez = oknoBezModuluDawki().VildaGhPunkty;
    for (const typ of ['start', 'continue', 'end']) {
      expect(bez.sprawdzRodzaj([], typ, { wiekM: 100 })).toEqual({ ok: false, kod: 'brak-modulu', komunikat: ODSWIEZ });
    }
    // Moduł bez funkcji ghKursy też się nie liczy.
    const o = oknoBezModuluDawki();
    o.VildaTrajectoryAnalysis = { therapyIntervals: () => [] };
    expect(o.VildaGhPunkty.sprawdzRodzaj([], 'start', { wiekM: 100 }).kod).toBe('brak-modulu');
    // Moduł czytany przy wywołaniu: dołożony później działa.
    loadBrowserScript('vilda_trajectory_analysis.js', o);
    expect(o.VildaGhPunkty.sprawdzRodzaj([], 'start', { wiekM: 100 })).toEqual({ ok: true });
  });
});

describe('wiekMiesZPol — wiek punktu z pól formularza jak w polaZPodawanej', () => {
  it.each([
    ['10', '14', 134], ['9', '11', 119], ['10.5', '3', 129], ['7', '2.6', 87], ['12.25', '', 147], ['10', 'x', 120],
    ['0', '5', 5], ['11', '-3', 129], ['-0', '5', 5], [9, 6, 114], ['0', '0', 0], ['-1', '6', -6],
  ])('lata „%s”, miesiące „%s” → %d mies.', (lata, mies, oczekiwany) => {
    expect(A.wiekMiesZPol(lata, mies)).toBe(oczekiwany);
    // Ten sam wiek zapisze polaZPodawanej (gdy reszta pól jest poprawna).
    const r = A.polaZPodawanej({ ...POLA_FORMULARZA, lata, miesiace: mies }, 'wsteczny');
    if (r.ok) expect(r.pola.ageYears * 12 + r.pola.ageMonths).toBe(oczekiwany);
  });

  it('lata puste albo nieliczbowe → NaN', () => {
    expect(A.wiekMiesZPol('', '3')).toBeNaN();
    expect(A.wiekMiesZPol('x', '3')).toBeNaN();
    expect(A.wiekMiesZPol(undefined, undefined)).toBeNaN();
  });
});

describe('dostepneRodzaje — rodzaje proponowane w formularzach (P-GH-WZNOWIENIE, część 2)', () => {
  // Bez opcji: punkt po ostatnim istniejącym (ostatni kurs ghKursy).
  it.each([
    ['pusta lista', [], { start: true, continue: true, end: false, domyslny: 'start' }],
    ['brak listy', null, { start: true, continue: true, end: false, domyslny: 'start' }],
    ['ostatni kurs otwarty z Włączeniem', [WLACZENIE, KONTYNUACJA], { start: false, continue: true, end: true, domyslny: 'continue' }],
    ['ostatni kurs otwarty bez Włączenia (P-GH-BEZ-STARTU)', [KONTYNUACJA], { start: true, continue: true, end: true, domyslny: 'start' }],
    ['ostatni kurs zamknięty (GW2)', [WLACZENIE, ZAKONCZENIE], { start: true, continue: false, end: false, domyslny: 'start' }],
    ['samo Zakończenie', [ZAKONCZENIE], { start: true, continue: false, end: false, domyslny: 'start' }],
    ['wznowienie (kurs 2 z Włączeniem)', [W7, Z9, W10], { start: false, continue: true, end: true, domyslny: 'continue' }],
    ['stary zapis W2 (kurs 2 bez Włączenia)', [W7, Z9, K10], { start: true, continue: true, end: true, domyslny: 'start' }],
    ['puste wpisy w liście', [null, WLACZENIE, undefined], { start: false, continue: true, end: true, domyslny: 'continue' }],
  ])('najnowszy punkt — %s', (_opis, lista, oczekiwany) => {
    expect(A.dostepneRodzaje(lista)).toEqual(oczekiwany);
  });

  // opcje.wsteczny (formularz wstecznego punktu): rodzaje możliwe w jakimkolwiek wieku. Przy jednym kursie jak dawne
  // ghRetroSyncTypeOptions, poza Włączeniem po Zakończeniu (wznowienie) i Zakończeniem na pustej liście.
  it.each([
    ['pusta lista', [], { start: true, continue: true, end: false, domyslny: 'start' }],
    ['tylko Kontynuacja', [KONTYNUACJA], { start: true, continue: true, end: true, domyslny: 'start' }],
    ['jest Włączenie', [WLACZENIE, KONTYNUACJA], { start: false, continue: true, end: true, domyslny: 'continue' }],
    ['Włączenie i Zakończenie', [WLACZENIE, ZAKONCZENIE], { start: true, continue: true, end: false, domyslny: 'continue' }],
    ['samo Zakończenie', [ZAKONCZENIE], { start: true, continue: true, end: false, domyslny: 'start' }],
    ['brak listy', null, { start: true, continue: true, end: false, domyslny: 'start' }],
    ['puste wpisy w liście', [null, WLACZENIE, undefined], { start: false, continue: true, end: true, domyslny: 'continue' }],
    ['wznowienie otwarte', [W7, Z9, W10], { start: false, continue: true, end: true, domyslny: 'continue' }],
    ['wznowienie zakończone', [W7, Z9, W10, G('gw-z11', 'end', 11, 0)], { start: true, continue: true, end: false, domyslny: 'continue' }],
    ['stary zapis W2', [W7, Z9, K10], { start: true, continue: true, end: true, domyslny: 'start' }],
  ])('wsteczny — %s', (_opis, lista, oczekiwany) => {
    expect(A.dostepneRodzaje(lista, { wsteczny: true })).toEqual(oczekiwany);
  });

  it('bez modułu kursów: wszystkie rodzaje z flagą brakModulu (zapis i tak odmówi z prośbą o odświeżenie)', () => {
    const bez = oknoBezModuluDawki().VildaGhPunkty;
    expect(bez.dostepneRodzaje([WLACZENIE])).toEqual({ start: true, continue: true, end: true, domyslny: 'continue', brakModulu: true });
    expect(bez.dostepneRodzaje([], { wsteczny: true })).toEqual({ start: true, continue: true, end: true, domyslny: 'start', brakModulu: true });
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

  it('Increlex z opcje { dawka: null } → bez × 2: dose 0,5/30, doseAbs 0,5, bezModuluDawki: true — API liczy dalej, monitor od D6 w tym stanie nie zapisuje (P-GH-DAWKA-BEZ-MODULU)', () => {
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

  // P-GH-NOWE-ID: id pamięta moduł, więc przypadki ze sztucznym zegarem dostają własną, świeżą kopię modułu —
  // zegar z przyszłości nie przesuwa wtedy id współdzielonego A w pozostałych testach.
  const swiezyModul = () => loadBrowserScript('vilda_gh_punkty.js', {}).VildaGhPunkty;
  const T = Date.UTC(2026, 0, 1); // 1767225600000
  // Dawny generator (do 2026-10-21): String(Date.now() + Math.random()).
  const dawneId = (ms, losowa) => String(ms + losowa);

  it('format: całe ms z Date.now(), kropka, trzy cyfry; pierwsze id w milisekundzie od losowej pozycji 0–499, kolejne +0,001', () => {
    const P = swiezyModul();
    const zegar = vi.spyOn(Date, 'now').mockReturnValue(T);
    const los = vi.spyOn(Math, 'random').mockReturnValue(0.25);

    expect(P.noweId()).toBe('1767225600000.125');
    expect(P.noweId()).toBe('1767225600000.126');
    expect(P.noweId()).toBe('1767225600000.127');
    expect(los, 'los tylko przy pierwszym id w milisekundzie').toHaveBeenCalledTimes(1);

    zegar.mockReturnValue(T + 1);
    los.mockReturnValue(0);
    expect(P.noweId()).toBe('1767225600001.000');
    los.mockReturnValue(0.999999);
    zegar.mockReturnValue(T + 2);
    expect(P.noweId()).toBe('1767225600002.499');
    expect(P.noweId()).toBe('1767225600002.500');
  });

  it('przyczyna: dawny wzór przy dzisiejszym Date.now() skleja różne losowania w jedno id — nowy nie', () => {
    // Liczba rzędu 1,8e12 ma krok 2^-12 ≈ 0,000244: dwa różne Math.random() dają ten sam napis.
    expect(dawneId(T, 0.25)).toBe(dawneId(T, 0.25001));

    const P = swiezyModul();
    vi.spyOn(Date, 'now').mockReturnValue(T);
    const los = vi.spyOn(Math, 'random').mockReturnValue(0.25);
    const a = P.noweId();
    los.mockReturnValue(0.25001);
    expect(P.noweId()).not.toBe(a);
  });

  it('sztuczny zegar stoi: 2000 wywołań w tej samej milisekundzie — wszystkie różne, także jako liczby, ściśle rosnące', () => {
    const P = swiezyModul();
    vi.spyOn(Date, 'now').mockReturnValue(T);
    vi.spyOn(Math, 'random').mockReturnValue(0.999999); // najgorszy start: pozycja 499

    const id = Array.from({ length: 2000 }, () => P.noweId());

    expect(new Set(id).size).toBe(2000);
    expect(new Set(id.map(Number)).size).toBe(2000);
    for (let i = 0; i < id.length; i += 1) {
      expect(id[i], `id[${i}]`).toMatch(/^\d+\.\d{3}$/);
      if (i > 0) expect(Number(id[i]), `id[${i}] > id[${i - 1}]`).toBeGreaterThan(Number(id[i - 1]));
    }
    // 501 pierwszych (pozycje 499–999) mieści się w [T, T + 1) — kontrakt z testu bez atrap.
    expect(id[0]).toBe('1767225600000.499');
    expect(id[500]).toBe('1767225600000.999');
    expect(Number(id[500])).toBeLessThan(T + 1);
    // Dopiero 502. id w tej samej milisekundzie wyprzedza zegar — nadal bez powtórzenia.
    expect(id[501]).toBe('1767225600001.000');
    expect(id[1999]).toBe('1767225600002.498');
  });

  it('po przepełnieniu zegar dogania licznik: kolejne id dalej rosną, żadne się nie powtarza', () => {
    const P = swiezyModul();
    const zegar = vi.spyOn(Date, 'now').mockReturnValue(T);
    vi.spyOn(Math, 'random').mockReturnValue(0.5); // start 250 → T+1.000 po 751 wywołaniach

    const id = Array.from({ length: 751 }, () => P.noweId());
    expect(id.at(-1)).toBe('1767225600001.000');

    zegar.mockReturnValue(T + 1);
    id.push(P.noweId(), P.noweId());
    zegar.mockReturnValue(T + 2);
    id.push(P.noweId());

    expect(id.slice(-4)).toEqual(['1767225600001.000', '1767225600001.001', '1767225600001.002', '1767225600002.250']);
    expect(new Set(id).size).toBe(id.length);
  });

  it('cofnięty zegar (np. korekta czasu systemu): id nie wraca do wartości już wydanych', () => {
    const P = swiezyModul();
    const zegar = vi.spyOn(Date, 'now').mockReturnValue(T + 5);
    vi.spyOn(Math, 'random').mockReturnValue(0);

    const id = [P.noweId(), P.noweId()];
    zegar.mockReturnValue(T);
    id.push(P.noweId(), P.noweId());

    expect(id).toEqual(['1767225600005.000', '1767225600005.001', '1767225600005.002', '1767225600005.003']);
  });

  it('osobne kopie modułu (inne ramki) z tym samym zegarem: start losowy, jak dawny składnik losowy', () => {
    vi.spyOn(Date, 'now').mockReturnValue(T);
    const los = vi.spyOn(Math, 'random');

    los.mockReturnValue(0.1);
    const a = swiezyModul().noweId();
    los.mockReturnValue(0.7);
    const b = swiezyModul().noweId();

    expect([a, b]).toEqual(['1767225600000.050', '1767225600000.350']);
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

// P-GH-PUNKTY-USZKODZONE (rata 4, wersja 3): uszkodzony wpis listy = wpis, który nie jest obiektem. Decyzja właściciela
// 2026-10-07: każdy taki wpis (null, liczba, napis, true/false), pusty obiekt i tablica zostają.
describe('uszkodzone, bezUszkodzonych i komunikatyUszkodzonych — uszkodzone wpisy listy punktów', () => {
  const LISTA = [WLACZENIE, null, KONTYNUACJA, 5, 'x', true, false, 0, '', undefined, {}, [], ZAKONCZENIE];

  it('uszkodzone: indeksy wpisów niebędących obiektem, rosnąco; pusty obiekt i tablica nie są uszkodzone', () => {
    expect(A.uszkodzone(LISTA)).toEqual([1, 3, 4, 5, 6, 7, 8, 9]);
    expect(A.uszkodzone([WLACZENIE, KONTYNUACJA])).toEqual([]);
    expect(A.uszkodzone([])).toEqual([]);
    for (const nieLista of [null, undefined, {}, 'x', 5]) expect(A.uszkodzone(nieLista), String(nieLista)).toEqual([]);
  });

  it('bezUszkodzonych: nowa lista, te same obiekty w tej samej kolejności; wejście bez zmian', () => {
    const wejscie = LISTA.slice();
    const wynik = A.bezUszkodzonych(wejscie);
    expect(wynik).toHaveLength(5);
    expect(wynik[0]).toBe(WLACZENIE);
    expect(wynik[1]).toBe(KONTYNUACJA);
    expect(wynik[2]).toEqual({});
    expect(wynik[3]).toEqual([]);
    expect(wynik[4]).toBe(ZAKONCZENIE);
    expect(wynik).not.toBe(wejscie);
    expect(wejscie).toEqual(LISTA);
    // Czysta lista: kopia z tymi samymi elementami.
    const czysta = [WLACZENIE, KONTYNUACJA];
    expect(A.bezUszkodzonych(czysta)).toEqual(czysta);
    expect(A.bezUszkodzonych(czysta)).not.toBe(czysta);
    expect(A.bezUszkodzonych(null)).toEqual([]);
  });

  it('komunikatyUszkodzonych(1): teksty z makiety zaakceptowanej przez właściciela 2026-10-07', () => {
    expect(A.komunikatyUszkodzonych(1)).toEqual({
      liczba: 1,
      ostrzezenie: 'Lista punktów zawiera 1 uszkodzony wpis bez danych. Nie jest pokazywany w tabeli. Zapisywanie i usuwanie '
        + 'punktów jest wstrzymane, dopóki go nie usuniesz.',
      naglowek: 'Uszkodzony wpis na liście punktów',
      tresc: 'Nie zapisano: lista punktów leczenia tego pacjenta zawiera 1 uszkodzony wpis bez danych. Usuń go, aby zapisywać '
        + 'punkty. Pozostałe punkty się nie zmienią.',
      przycisk: 'Usuń uszkodzony wpis',
    });
  });

  it('komunikatyUszkodzonych: liczba mnoga — 2–4 wpisy (bez 12–14), pozostałe wpisów; przycisk z liczbą', () => {
    const forma = (n) => A.komunikatyUszkodzonych(n).ostrzezenie.match(/zawiera (.+?) bez danych/)[1];
    expect(forma(2)).toBe('2 uszkodzone wpisy');
    expect(forma(4)).toBe('4 uszkodzone wpisy');
    expect(forma(5)).toBe('5 uszkodzonych wpisów');
    expect(forma(12)).toBe('12 uszkodzonych wpisów');
    expect(forma(14)).toBe('14 uszkodzonych wpisów');
    expect(forma(22)).toBe('22 uszkodzone wpisy');
    expect(forma(25)).toBe('25 uszkodzonych wpisów');
    expect(forma(112)).toBe('112 uszkodzonych wpisów');
    const dwa = A.komunikatyUszkodzonych(2);
    expect(dwa.naglowek).toBe('Uszkodzone wpisy na liście punktów');
    expect(dwa.przycisk).toBe('Usuń uszkodzone wpisy (2)');
    expect(dwa.ostrzezenie).toBe('Lista punktów zawiera 2 uszkodzone wpisy bez danych. Nie są pokazywane w tabeli. '
      + 'Zapisywanie i usuwanie punktów jest wstrzymane, dopóki ich nie usuniesz.');
    expect(dwa.tresc).toBe('Nie zapisano: lista punktów leczenia tego pacjenta zawiera 2 uszkodzone wpisy bez danych. '
      + 'Usuń je, aby zapisywać punkty. Pozostałe punkty się nie zmienią.');
  });
});
