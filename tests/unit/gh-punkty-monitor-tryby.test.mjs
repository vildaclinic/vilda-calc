import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  MONITOR_PRZED_API, MONITOR_PRZED_API_SHA256, opcjePrzedApi, rodzaje, utworzAtrapeMonitoraGh, zrodlo,
} from '../support/gh-monitor-atrapa.mjs';

// P-GH-PUNKTY-API rata 2 (PR-4) i rata 3 (PR-5, D5). Monitor punktów terapii GH (gh_therapy_monitor.js) bierze reguły
// punktu z VildaGhPunkty (vilda_gh_punkty.js); od raty 3 bez zgodnego modułu nie zapisuje i prosi o odświeżenie strony,
// a stary kod reguł jest usunięty. Ten test uruchamia te same scenariusze na PRAWDZIWYM dzisiejszym monitorze z modułem
// i na zamrożonym monitorze sprzed API (MONITOR_PRZED_API, gh_therapy_monitor.js 52) i porównuje CAŁY obserwowalny
// wynik: wyjątek, dziennik (zapis modułu, zdarzenia, kanał, komunikaty), listę w oknie i w pamięci modułu, formularze,
// wiersze tabeli, powiadomienia wskaźnika zapisu, ostrzeżenia dziennika diagnostycznego i drugi klik. Liczby porównujemy
// z rozróżnieniem -0 i NaN, klucze w kolejności. Złota siatka: gh-punkty-siatka.test.mjs. Dodatkowo licznik wywołań API
// pokazuje, że monitor naprawdę deleguje, a sprawdzenie edycji spoza listy idzie przed API (decyzja właściciela
// 2026-10-07). Odmowę bez zgodnego modułu sprawdzają testy na końcu pliku. Wpisy listy niebędące obiektem (null, liczba,
// napis) są od P-GH-PUNKTY-USZKODZONE (rata 4) uszkodzone i świadomie obsługiwane inaczej niż przed API: sprawdza je
// gh-punkty-uszkodzone.test.mjs, tu porównanie obejmuje tylko wpisy-obiekty. Dane wyłącznie FIKCYJNE.

const punkt = (id, type, nadpisania = {}) => ({
  id, type, ageYears: 9, ageMonths: 0, weight: 32, height: 130, boneAge: null, dose: 0.025, doseUnit: 'mg/kg/d',
  drug: 'Omnitrope 10 mg', program: 'SNP', igf1: null, igf1Unit: 'ng/mL', igf1DaysSinceDose: null, doseAbs: 0.8,
  ...nadpisania,
});
const WLACZENIE = punkt('fikc-start', 'start');
const KONTYNUACJA = punkt('fikc-kont', 'continue', { ageYears: 10, weight: 36, height: 138, doseAbs: 0.9 });
const ZAKONCZENIE = punkt('fikc-koniec', 'end', { ageYears: 12, weight: 40, height: 150, doseAbs: 1 });
// Dawny format: bez ageMonths, boneAge, pól IGF-1 i doseAbs, z obcym polem w środku; id liczbowe.
const DAWNY = { id: 77, type: 'continue', ageYears: 9.5, notatkaTestowa: 'fikcyjne obce pole', weight: 30, height: 135,
  dose: 0.03, doseUnit: 'mg/kg/d', drug: 'Omnitrope 10 mg', program: 'SNP' };
const NGENLA = punkt('fikc-ngenla', 'continue', { drug: 'Ngenla 60 mg', doseUnit: 'mg/kg/tydz', dose: 0.66, doseAbs: 3 });
const KARTA = { drug: 'Omnitrope 10 mg', weight: 32, perDayMg: 0.8, perWeekMg: 5.6 };
const WSTECZNY = {
  ghRetroType: 'continue', ghRetroProg: 'SNP', ghRetroDrug: 'Omnitrope 10 mg', ghRetroAge: '9', ghRetroAgeMonths: '6',
  ghRetroWeight: '32', ghRetroHeight: '133', ghRetroDose: '0.96',
};

// Tryby: dzisiejszy monitor z modułem (jak docpro.html) i monitor sprzed API bez modułu (wyrocznia).
const TERAZ = (opcje) => ({ ...opcje, modulPunktow: true });
const PRZED_API = opcjePrzedApi;

// Postać porównywalna: -0 i NaN jawnie, błędy jako nazwa i treść, funkcje jako znacznik.
function kanon(v) {
  return JSON.stringify(v, (_k, x) => {
    if (typeof x === 'number') {
      if (Object.is(x, -0)) return '#-0';
      if (Number.isNaN(x)) return '#NaN';
      if (!Number.isFinite(x)) return `#${x}`;
    }
    if (x === undefined) return '#undefined';
    if (typeof x === 'function') return '#funkcja';
    if (x instanceof Error) return { blad: x.name, tresc: x.message };
    return x;
  });
}

function zrzut(atrapa, wyjatek) {
  const s = atrapa.stan();
  let wiersze;
  try { wiersze = atrapa.idWierszy(); } catch (e) { wiersze = `#${e.message}`; }
  return {
    wyjatek: wyjatek ? { blad: wyjatek.name, tresc: wyjatek.message } : null,
    dziennik: s.dziennik,
    okno: s.okno,
    modul: s.modulSurowy,
    komunikat: s.komunikat,
    edycjaWidoczna: s.edycjaWidoczna,
    wstecznyWidoczny: s.wstecznyWidoczny,
    powiadomienia: s.powiadomienia,
    znaczniki: s.znaczniki,
    ostrzezenia: atrapa.ostrzezenia.map((o) => o.map((x) => (x instanceof Error ? { blad: x.name, tresc: x.message } : x))),
    wiersze,
    licznik: (atrapa.pole('ghTabMonCount') || {}).textContent ?? null,
  };
}

// Jeden scenariusz w jednym trybie. Każdy krok osobno łapie wyjątek (onclick w przeglądarce też nie przerywa kolejnych
// kliknięć); zrzut po każdym kroku.
function przebieg(scenariusz, tryb, { zlicz = false } = {}) {
  const atrapa = utworzAtrapeMonitoraGh(tryb(scenariusz.opcje || {}));
  const wywolania = [];
  if (zlicz && atrapa.win.VildaGhPunkty) {
    const api = atrapa.win.VildaGhPunkty;
    const licznik = { wersja: api.wersja, KLUCZE: api.KLUCZE, RODZAJE: api.RODZAJE, KOMUNIKATY: api.KOMUNIKATY };
    for (const [k, f] of Object.entries(api)) {
      if (typeof f === 'function') licznik[k] = (...a) => { wywolania.push(k); return f(...a); };
    }
    atrapa.win.VildaGhPunkty = licznik;
  }
  const zrzuty = [];
  for (const krok of scenariusz.kroki) {
    const od = wywolania.length;
    let wyjatek = null;
    try { krok(atrapa); } catch (e) { wyjatek = e; }
    zrzuty.push({ ...zrzut(atrapa, wyjatek), api: wywolania.slice(od) });
  }
  return { atrapa, zrzuty };
}

function porownaj(scenariusz) {
  const z = przebieg(scenariusz, TERAZ).zrzuty;
  const b = przebieg(scenariusz, PRZED_API).zrzuty;
  for (let i = 0; i < z.length; i += 1) {
    const { api: _a, ...zm } = z[i];
    const { api: _b, ...zb } = b[i];
    expect(kanon(zm), `${scenariusz.nazwa} — krok ${i + 1}`).toBe(kanon(zb));
  }
  return { z, b };
}

const ustawPacjenta = (a, id) => a.win.sessionStorage.setItem('vildaCurrentPatientId', id);
const zKarty = (typ, pola = {}) => (a) => a.dodajZKarty(typ, pola);
const wsteczny = (pola = {}, opcje) => (a) => a.dodajWsteczny({ ...WSTECZNY, ...pola }, opcje);
const edytuj = (id, pola, typ) => (a) => a.edytuj(id, pola, typ);
const klik = (id) => (a) => a.kliknij(id);
const PRZYCISK = { start: 'btnGhStart', continue: 'btnGhContinue', end: 'btnGhEnd' };
const przycisk = (typ) => klik(PRZYCISK[typ]);
const modul = (lista) => (a) => a.ustawModul(lista);

/* ---------- Scenariusze ---------- */

const ZWYKLE = [];
for (const typ of ['start', 'continue', 'end']) {
  for (const [opis, punkty] of [['pusta lista', []], ['pełny kurs', [WLACZENIE, KONTYNUACJA, ZAKONCZENIE]],
    ['Włączenie', [WLACZENIE]], ['dawny format', [DAWNY]]]) {
    ZWYKLE.push({ nazwa: `karta ${typ}, ${opis}`, opcje: { punkty, ghTherapyCalc: KARTA }, kroki: [zKarty(typ)] });
    ZWYKLE.push({ nazwa: `wsteczny ${typ}, ${opis}`, opcje: { punkty }, kroki: [wsteczny({ ghRetroType: typ })] });
  }
}
for (const [opis, pola] of [['wiek 0', { age: '0', ageMonths: '0' }], ['masa 0', { weight: '0' }], ['wzrost pusty', { height: '' }],
  ['pusty preparat', { therDrug: '' }], ['wiek 10 l. 14 mies.', { age: '10', ageMonths: '14' }], ['Ngenla', { therProg: 'SNP', therDrug: 'Ngenla 60 mg' }],
  ['Increlex', { therProg: 'IGF-1', therDrug: 'Increlex 40 mg' }], ['dawka pusta bez placeholdera', { therDailyDose: '' }]]) {
  ZWYKLE.push({ nazwa: `karta continue, ${opis}`, opcje: { punkty: [WLACZENIE] }, kroki: [zKarty('continue', pola)] });
  ZWYKLE.push({ nazwa: `karta continue, ${opis}, bez modułu dawki`, opcje: { punkty: [WLACZENIE], modulDawki: false },
    kroki: [zKarty('continue', pola)] });
}
for (const [opis, pola] of [['wiek 0', { ghRetroAge: '0', ghRetroAgeMonths: '0' }], ['dawka x', { ghRetroDose: 'x' }],
  ['pusty program', { ghRetroProg: '' }], ['Ngenla z IGF-1 bez dni', { ghRetroDrug: 'Ngenla 60 mg', ghRetroDose: '14', ghRetroIgf1: '250' }],
  ['Increlex 0,5', { ghRetroProg: 'IGF-1', ghRetroDrug: 'Increlex 40 mg', ghRetroDose: '0.5' }], ['wiek kostny -0', { ghRetroBoneAge: '-0' }]]) {
  for (const modulDawki of [true, false]) {
    ZWYKLE.push({ nazwa: `wsteczny, ${opis}${modulDawki ? '' : ', bez modułu dawki'}`, opcje: { punkty: [WLACZENIE], modulDawki },
      kroki: [wsteczny(pola)] });
  }
}
for (const typ of ['start', 'continue', 'end']) {
  for (const [opis, punkty, cel, pola] of [
    ['Kontynuacja, wzrost', [WLACZENIE, KONTYNUACJA, ZAKONCZENIE], KONTYNUACJA.id, { ghEditHeight: '139' }],
    ['Włączenie, masa', [WLACZENIE, KONTYNUACJA], WLACZENIE.id, { ghEditWeight: '33.7' }],
    ['dawny format, IGF-1', [WLACZENIE, DAWNY], DAWNY.id, { ghEditIgf1: '250', ghEditIgfDays: '2' }],
    ['Ngenla, IGF-1 bez dni', [WLACZENIE, NGENLA], NGENLA.id, { ghEditIgf1: '187.4' }],
    ['zła masa', [WLACZENIE, KONTYNUACJA], KONTYNUACJA.id, { ghEditWeight: '0' }],
    ['pusty preparat', [WLACZENIE, KONTYNUACJA], KONTYNUACJA.id, { ghEditDrug: '' }],
    ['Increlex na podanie', [WLACZENIE, KONTYNUACJA], KONTYNUACJA.id, { ghEditDrug: 'Increlex 40 mg', ghEditDose: '0.5' }],
  ]) {
    ZWYKLE.push({ nazwa: `edycja ${typ}, ${opis}`, opcje: { punkty }, kroki: [edytuj(cel, pola, typ)] });
  }
}
ZWYKLE.push({ nazwa: 'usunięcie Kontynuacji', opcje: { punkty: [WLACZENIE, KONTYNUACJA] }, kroki: [(a) => a.usun(KONTYNUACJA.id)] });
ZWYKLE.push({ nazwa: 'usunięcie punktu w dawnym formacie (id liczbowe)', opcje: { punkty: [WLACZENIE, DAWNY] }, kroki: [(a) => a.usun(DAWNY.id)] });
ZWYKLE.push({ nazwa: 'dwa zapisy z rzędu: wsteczny, potem karta', opcje: { punkty: [], ghTherapyCalc: KARTA },
  kroki: [wsteczny({ ghRetroType: 'start' }), zKarty('continue'), zKarty('start')] });

// Edycja spoza bieżącej listy i zmiana pacjenta (P-GH-EDYCJA-LISTA, P-GH-EDYCJA-PACJENT): z każdymi danymi formularza.
const Z3 = [];
for (const [opisDanych, pola, typ] of [['poprawne dane', { ghEditHeight: '139' }, 'continue'],
  ['zła masa', { ghEditWeight: '0' }, 'continue'], ['pusty preparat', { ghEditDrug: '' }, 'continue'],
  ['przycisk Włączenie przy innym Włączeniu', { ghEditHeight: '139' }, 'start']]) {
  Z3.push({ nazwa: `punkt usunięty w innej ramce, ${opisDanych}`, opcje: { punkty: [WLACZENIE, KONTYNUACJA] },
    kroki: [edytuj(KONTYNUACJA.id, pola), modul([WLACZENIE]), przycisk(typ), klik('btnGhContinue')] });
  Z3.push({ nazwa: `zmiana pacjenta karty, ${opisDanych}`, opcje: { punkty: [WLACZENIE, KONTYNUACJA] },
    kroki: [(a) => ustawPacjenta(a, 'fikc-pacjent-1'), edytuj(KONTYNUACJA.id, pola), (a) => ustawPacjenta(a, 'fikc-pacjent-2'),
      przycisk(typ), klik('btnGhContinue')] });
}
Z3.push({ nazwa: 'odświeżenie listy z innej ramki w trakcie edycji (punkt został)', opcje: { punkty: [WLACZENIE, KONTYNUACJA] },
  kroki: [edytuj(KONTYNUACJA.id, { ghEditHeight: '139' }), (a) => a.zdarzenieOkna('storage', { key: 'GH_THERAPY_POINTS' }), klik('btnGhContinue')] });

// Wpisy-obiekty nietypowe dla punktu (pusta tablica, pusty obiekt, punkt o id null). Wpisy niebędące obiektem (null,
// liczba, napis, true) są uszkodzone (P-GH-PUNKTY-USZKODZONE): gh-punkty-uszkodzone.test.mjs.
const OBIEKTY = [];
// Edycja wiersza bez id: formularz dostaje pełne, poprawne pola, żeby zapis doszedł do przypisania pól wpisu.
const PELNA_EDYCJA = { ghEditDrug: 'Omnitrope 10 mg', ghEditAge: '9', ghEditAgeMonths: '0', ghEditWeight: '32',
  ghEditHeight: '139', ghEditDose: '0.8' };
for (const [opis, wpis] of [['tablica', []], ['pusty obiekt', {}]]) {
  OBIEKTY.push({ nazwa: `wpis ${opis}: karta, wsteczny, edycja wiersza bez id`, opcje: { punkty: [WLACZENIE, wpis], ghTherapyCalc: KARTA },
    kroki: [zKarty('continue'), wsteczny({ ghRetroType: 'continue' }), edytuj('undefined', PELNA_EDYCJA, 'continue')] });
}
// Punkt o id null: sprawdzenie drugiego Włączenia w karcie pomija String(id) === "null" (stan obecny), a wsteczny nie.
const WLACZENIE_BEZ_ID = punkt(null, 'start');
OBIEKTY.push({ nazwa: 'Włączenie z id null: karta start, wsteczny start', opcje: { punkty: [WLACZENIE_BEZ_ID], ghTherapyCalc: KARTA },
  kroki: [zKarty('start'), wsteczny({ ghRetroType: 'start' })] });

// Zapis i kanał w sytuacjach brzegowych: błąd zapisu modułu, brak getTabId, wyjątek getTabId.
const BRZEGI = [
  { nazwa: 'błąd zapisu modułu: ostrzeżenie w dzienniku diagnostycznym, sygnały idą dalej', opcje: { punkty: [WLACZENIE] },
    kroki: [(a) => { a.win.VildaPersistence.writeModuleJSON = () => { throw new Error('fikcyjny błąd zapisu'); }; }, wsteczny()] },
  { nazwa: 'bez getTabId: tabId z sessionStorage', opcje: { punkty: [WLACZENIE], getTabId: null, sesjaTabId: 'fikc-sesja' },
    kroki: [wsteczny()] },
  { nazwa: 'getTabId rzuca: komunikat bez tabId', opcje: { punkty: [WLACZENIE], getTabId: () => { throw new Error('fikc'); } },
    kroki: [wsteczny()] },
  { nazwa: 'reset monitora po zapisie', opcje: { punkty: [WLACZENIE] },
    kroki: [wsteczny(), (a) => a.zdarzenieOkna('vilda:user-state-cleared')] },
];
// (Moduł dawki bez funkcji preparat — w aplikacji go nie ma — od raty 3 daje odmowę; monitor sprzed API rzucał wtedy
// wyjątek albo zapisywał Increlex bez × 2. Sprawdza to test odmowy niżej, nie porównanie.)

describe('Monitor GH: dzisiejszy monitor z modułem VildaGhPunkty i monitor sprzed API — ten sam wynik', () => {
  it.each([
    ['zapisy i odmowy: karta, wsteczny, edycja, usuwanie', ZWYKLE],
    ['edycja spoza bieżącej listy i zmiana pacjenta', Z3],
    ['wpisy-obiekty nietypowe dla punktu (pusta tablica, pusty obiekt, id null)', OBIEKTY],
    ['zapis i kanał w sytuacjach brzegowych', BRZEGI],
  ])('%s', (_opis, scenariusze) => {
    expect(scenariusze.length).toBeGreaterThan(0);
    for (const s of scenariusze) porownaj(s);
  });
});

describe('Monitor GH z modułem: delegacja do VildaGhPunkty', () => {
  const api = (s, krok = 0) => przebieg(s, TERAZ, { zlicz: true }).zrzuty[krok].api;

  it('każda ścieżka zapisu woła API, a zapis listy to dokładnie jedno zapisz()', () => {
    expect(api({ opcje: { punkty: [WLACZENIE], ghTherapyCalc: KARTA }, kroki: [zKarty('continue')] }))
      .toEqual(['uszkodzone', 'sprawdzRodzaj', 'jednostkaDawki', 'dniIgf', 'normalizujWiek', 'sprawdzWartosci', 'zapisz']);
    expect(api({ opcje: { punkty: [WLACZENIE] }, kroki: [wsteczny()] }))
      .toEqual(['uszkodzone', 'sprawdzRodzaj', 'polaZPodawanej', 'punkt', 'zapisz']);
    expect(api({ opcje: { punkty: [WLACZENIE, KONTYNUACJA] }, kroki: [edytuj(KONTYNUACJA.id, { ghEditHeight: '139' }, 'continue')] }))
      .toEqual(['uszkodzone', 'sprawdzRodzaj', 'polaZPodawanej', 'zmienWMiejscu', 'zapisz']);
    expect(api({ opcje: { punkty: [WLACZENIE, KONTYNUACJA] }, kroki: [(a) => a.usun(KONTYNUACJA.id)] })).toEqual(['uszkodzone', 'zapisz']);
  });

  it('odmowy: API odmawia, monitor nie zapisuje (bez zapisz)', () => {
    expect(api({ opcje: { punkty: [WLACZENIE], ghTherapyCalc: KARTA }, kroki: [zKarty('start')] })).toEqual(['uszkodzone', 'sprawdzRodzaj']);
    expect(api({ opcje: { punkty: [WLACZENIE] }, kroki: [wsteczny({ ghRetroDose: '0' })] }))
      .toEqual(['uszkodzone', 'sprawdzRodzaj', 'polaZPodawanej']);
    expect(api({ opcje: { punkty: [WLACZENIE, KONTYNUACJA] }, kroki: [edytuj(KONTYNUACJA.id, { ghEditWeight: '0' }, 'continue')] }))
      .toEqual(['uszkodzone', 'sprawdzRodzaj', 'polaZPodawanej']);
  });

  it('edycja spoza bieżącej listy i zmiana pacjenta: odmowa monitora PRZED jakimkolwiek wywołaniem API', () => {
    const usuniety = przebieg({ opcje: { punkty: [WLACZENIE, KONTYNUACJA] },
      kroki: [edytuj(KONTYNUACJA.id, { ghEditWeight: '0' }), modul([WLACZENIE]), klik('btnGhStart')] }, TERAZ, { zlicz: true }).zrzuty[2];
    expect(usuniety.api).toEqual([]);
    expect(usuniety.komunikat).toBe('Nie zapisano zmian: edytowany punkt nie należy do bieżącej listy punktów. Otwórz edycję ponownie.');
    const pacjent = przebieg({ opcje: { punkty: [WLACZENIE, KONTYNUACJA] },
      kroki: [(a) => ustawPacjenta(a, 'fikc-pacjent-1'), edytuj(KONTYNUACJA.id, { ghEditDrug: '' }), (a) => ustawPacjenta(a, 'fikc-pacjent-2'),
        klik('btnGhContinue')] }, TERAZ, { zlicz: true }).zrzuty[3];
    expect(pacjent.api).toEqual([]);
    expect(pacjent.dziennik.filter((w) => w.rodzaj === 'M')).toEqual([]);
  });
});


/* ---------- Rata 3 (D5): bez zgodnego modułu monitor odmawia ---------- */

const ODSWIEZ = 'Nie zapisano: aplikacja nie wczytała się w całości. Odśwież stronę i spróbuj ponownie.';
const EDYCJA_SPOZA_LISTY = 'Nie zapisano zmian: edytowany punkt nie należy do bieżącej listy punktów. Otwórz edycję ponownie.';

// Stany, w których bramka Gpa() nie przepuszcza API. Każdy wariant zwraca funkcję, która przywraca zgodny moduł
// (jak po odświeżeniu strony), oraz dziennik wywołań podstawionego API.
const BEZ_API = [
  { nazwa: 'brak modułu VildaGhPunkty (plik nie doszedł)', opcje: { modulPunktow: false }, podmien: (w) => ({
    wywolania: [],
    przywroc: () => { new Function('window', 'globalThis', zrodlo('vilda_gh_punkty.js'))(w, w); },
  }) },
  ...[1, 2].map((wersja) => ({ nazwa: `API wersji ${wersja} (plik ${wersja === 1 ? 'raty 1' : 'rat 2–3'} z pamięci przeglądarki)`, opcje: {}, podmien: (w) => {
    const api = w.VildaGhPunkty;
    const wywolania = [];
    const stare = { wersja };
    for (const [k, f] of Object.entries(api)) if (typeof f === 'function') stare[k] = () => { wywolania.push(k); };
    w.VildaGhPunkty = stare;
    return { wywolania, przywroc: () => { w.VildaGhPunkty = api; } };
  } })),
  { nazwa: 'wyjątek przy odczycie VildaGhPunkty', opcje: {}, podmien: (w) => {
    const api = w.VildaGhPunkty;
    Object.defineProperty(w, 'VildaGhPunkty', { get() { throw new Error('fikcyjny błąd odczytu'); }, configurable: true });
    return { wywolania: [], przywroc: () => { Object.defineProperty(w, 'VildaGhPunkty', { value: api, writable: true, configurable: true }); } };
  } },
  { nazwa: 'moduł dawki bez funkcji preparat', opcje: {}, podmien: (w) => {
    const dawka = w.VildaGhDawka;
    w.VildaGhDawka = {};
    return { wywolania: [], przywroc: () => { w.VildaGhDawka = dawka; } };
  } },
];
// Czynności lekarza: start (przed odmową), zapis i powtórzenie zapisu po przywróceniu modułu. `formularz` mówi, który
// formularz ma zostać otwarty po odmowie.
const CZYNNOSCI = [
  ...['start', 'continue', 'end'].map((typ) => ({
    nazwa: `karta: ${typ}`, opcje: { punkty: typ === 'start' ? [] : [WLACZENIE], ghTherapyCalc: KARTA },
    zapis: zKarty(typ), ponow: zKarty(typ), formularz: null,
  })),
  { nazwa: 'edycja punktu z listy', opcje: { punkty: [WLACZENIE, KONTYNUACJA] },
    przed: edytuj(KONTYNUACJA.id, { ghEditHeight: '139', ghEditDrug: 'Increlex 40 mg', ghEditDose: '0.5' }),
    zapis: przycisk('continue'), ponow: przycisk('continue'), formularz: 'edycjaWidoczna' },
  // Formularz wypełniony przed podmianą: przy module dawki bez preparat wyjątek rzuca już obsługa pola preparatu
  // (etykieta dawki, Gmpod — tak samo w monitorze sprzed API), zanim lekarz dojdzie do „Dodaj punkt”.
  { nazwa: 'punkt wsteczny', opcje: { punkty: [WLACZENIE] },
    przed: (a) => {
      a.kliknij('btnGhRetro');
      for (const [id, v] of Object.entries({ ...WSTECZNY, ghRetroProg: 'IGF-1', ghRetroDrug: 'Increlex 40 mg', ghRetroDose: '0.5' })) a.ustaw(id, v);
    },
    zapis: klik('btnGhRetroAdd'), ponow: klik('btnGhRetroAdd'), formularz: 'wstecznyWidoczny' },
  { nazwa: 'usunięcie punktu', opcje: { punkty: [WLACZENIE, KONTYNUACJA] },
    zapis: (a) => a.usun(KONTYNUACJA.id), ponow: (a) => a.usun(KONTYNUACJA.id), formularz: null },
];

describe('Monitor GH, rata 3 (D5): bez zgodnego modułu VildaGhPunkty nie zapisuje i prosi o odświeżenie strony', () => {
  for (const wariant of BEZ_API) {
    it.each(CZYNNOSCI.map((c) => [c.nazwa, c]))(`${wariant.nazwa}: %s`, (_n, czynnosc) => {
      const atrapa = utworzAtrapeMonitoraGh({ ...czynnosc.opcje, ...wariant.opcje });
      if (czynnosc.przed) czynnosc.przed(atrapa);
      const { wywolania, przywroc } = wariant.podmien(atrapa.win);
      const przed = atrapa.stan();

      expect(() => czynnosc.zapis(atrapa)).not.toThrow();
      const po = atrapa.stan();
      const nowe = po.dziennik.slice(przed.dziennik.length);
      // Odmowa: komunikat dla lekarza, bez zapisu modułu, kanału i wskaźnika zapisu; lista bez zmian.
      expect(po.komunikat).toBe(ODSWIEZ);
      expect(nowe.at(-1)).toEqual({ rodzaj: 'K', naglowek: 'Informacja', tekst: ODSWIEZ });
      expect(rodzaje(nowe).filter((r) => r !== 'E' && r !== 'K')).toEqual([]);
      expect(kanon(po.okno)).toBe(kanon(przed.okno));
      expect(po.modulSurowy).toBe(przed.modulSurowy);
      expect(po.powiadomienia).toEqual(przed.powiadomienia);
      expect(wywolania).toEqual([]);
      expect(atrapa.ostrzezenia).toEqual([]);
      // Formularz, z którego lekarz zapisywał, zostaje otwarty z wpisanymi danymi.
      if (czynnosc.formularz) expect(po[czynnosc.formularz]).toBe(true);

      // Po przywróceniu zgodnego modułu ten sam przycisk zapisuje tak jak monitor, który moduł miał od początku.
      przywroc();
      atrapa.zamknijKomunikat();
      czynnosc.ponow(atrapa);
      const wzor = utworzAtrapeMonitoraGh({ ...czynnosc.opcje });
      if (czynnosc.przed) czynnosc.przed(wzor);
      czynnosc.zapis(wzor);
      expect(rodzaje(atrapa.stan().dziennik).slice(-3)).toEqual(['M', 'E', 'BC']);
      expect(kanon(atrapa.stan().okno)).toBe(kanon(wzor.stan().okno));
      expect(atrapa.stan().modulSurowy).toBe(wzor.stan().modulSurowy);
    });
  }

  it('sprawdzenie edycji spoza bieżącej listy i zmiany pacjenta zostaje pierwsze także bez modułu', () => {
    for (const wariant of BEZ_API) {
      const usuniety = utworzAtrapeMonitoraGh({ punkty: [WLACZENIE, KONTYNUACJA], ...wariant.opcje });
      usuniety.edytuj(KONTYNUACJA.id, { ghEditHeight: '139' });
      wariant.podmien(usuniety.win);
      usuniety.ustawModul([WLACZENIE]);
      usuniety.kliknij('btnGhContinue');
      expect(usuniety.stan().komunikat, wariant.nazwa).toBe(EDYCJA_SPOZA_LISTY);

      const pacjent = utworzAtrapeMonitoraGh({ punkty: [WLACZENIE, KONTYNUACJA], ...wariant.opcje });
      ustawPacjenta(pacjent, 'fikc-pacjent-1');
      pacjent.edytuj(KONTYNUACJA.id, { ghEditHeight: '139' });
      wariant.podmien(pacjent.win);
      ustawPacjenta(pacjent, 'fikc-pacjent-2');
      pacjent.kliknij('btnGhContinue');
      expect(pacjent.stan().komunikat, wariant.nazwa).toBe(EDYCJA_SPOZA_LISTY);
      expect(rodzaje(pacjent.stan().dziennik).filter((r) => r === 'M' || r === 'BC')).toEqual([]);
    }
  });

  it('brak modułu ma pierwszeństwo przed regułami punktu (bez API monitor nie ocenia danych)', () => {
    const atrapa = utworzAtrapeMonitoraGh({ punkty: [WLACZENIE], ghTherapyCalc: KARTA, modulPunktow: false });
    atrapa.dodajZKarty('start', { weight: '0' });
    expect(atrapa.stan().komunikat).toBe(ODSWIEZ);
  });
});

describe('Monitor GH: łatka P-GH-PUNKTY-API rata 3 (D5) w artefakcie', () => {
  const tekst = zrodlo('gh_therapy_monitor.js');
  const przedApi = zrodlo(MONITOR_PRZED_API);

  it('wyrocznia to niezmieniony monitor sprzed API (skrót SHA-256)', () => {
    expect(createHash('sha256').update(przedApi).digest('hex')).toBe(MONITOR_PRZED_API_SHA256);
    expect(przedApi).not.toContain('VildaGhPunkty');
  });

  it('stary kod reguł punktu jest usunięty (był w monitorze sprzed API), a każdy zapis i usunięcie przechodzi przez bramkę', () => {
    for (const fragment of ['window.ghTherapyPoints.some(c=>c.type==="start"&&String(c.id)!==String(x))',
      'const u=window.ghTherapyPoints.findIndex(c=>String(c.id)===String(x));', 'try{ve(window.ghTherapyPoints||[])}',
      'window.ghTherapyPoints.some(function(_){return _.type==="start"})', 'function ve(', 'function Gmt(']) {
      expect(przedApi.split(fragment).length - 1, fragment).toBe(1);
      expect(tekst.split(fragment).length - 1, fragment).toBe(0);
    }
    expect(tekst.split('if(!Gpk){Gpn();return}').length - 1).toBe(3);
    // P-GH-PUNKTY-USZKODZONE: zaraz za bramką modułu (zapis W/K/Z i edycja, punkt wsteczny, usunięcie) bramka uszkodzonych wpisów.
    expect(tekst.split('if(!Gpk){Gpn();return}/* P-GH-PUNKTY-USZKODZONE */if(Gpg(Gpk))return;').length - 1).toBe(3);
  });

  it('sprawdzenie edycji spoza listy stoi przed bramką modułu, a klej nie łapie wyjątków reguł API', () => {
    const he = tekst.slice(tekst.indexOf('function He(e){'), tekst.indexOf('function se('));
    expect(he.indexOf('if(D(),Geb&&x==null){')).toBeGreaterThan(-1);
    expect(he.indexOf('if(D(),Geb&&x==null){')).toBeLessThan(he.indexOf('Gpa()'));
    const gph = tekst.slice(tekst.indexOf('function Gph('), tekst.indexOf('function Gph(') + 1200);
    expect(gph.slice(0, gph.indexOf('.zmienWMiejscu(') + 1)).not.toMatch(/try\{[^}]*polaZPodawanej/);
  });
});
