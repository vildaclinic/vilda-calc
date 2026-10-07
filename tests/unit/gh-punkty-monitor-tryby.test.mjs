import { describe, expect, it } from 'vitest';
import { utworzAtrapeMonitoraGh, zrodlo } from '../support/gh-monitor-atrapa.mjs';

// P-GH-PUNKTY-API rata 2 (PR-4). Monitor punktów terapii GH (gh_therapy_monitor.js) bierze reguły punktu z
// VildaGhPunkty (vilda_gh_punkty.js), a bez modułu wykonuje dosłownie stary kod. Ten test uruchamia te same scenariusze
// na PRAWDZIWYM monitorze w obu trybach (tests/support/gh-monitor-atrapa.mjs: modulPunktow true/false) i porównuje
// CAŁY obserwowalny wynik: wyjątek, dziennik (zapis modułu, zdarzenia, kanał, komunikaty), listę w oknie i w pamięci
// modułu, formularze, wiersze tabeli, powiadomienia wskaźnika zapisu, ostrzeżenia dziennika diagnostycznego i drugi
// klik. Liczby porównujemy z rozróżnieniem -0 i NaN, klucze w kolejności. Złota siatka w obu trybach:
// gh-punkty-siatka.test.mjs. Dodatkowo licznik wywołań API pokazuje, że tryb z modułem naprawdę deleguje, a sprawdzenie
// edycji spoza listy idzie przed API (decyzja właściciela 2026-10-07). Dane wyłącznie FIKCYJNE.

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

const TRYB_MODUL = { modulPunktow: true };
const TRYB_ZAPAS = { modulPunktow: false };

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
  const atrapa = utworzAtrapeMonitoraGh({ ...(scenariusz.opcje || {}), ...tryb });
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
  const z = przebieg(scenariusz, TRYB_MODUL).zrzuty;
  const b = przebieg(scenariusz, TRYB_ZAPAS).zrzuty;
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

// Pusty wpis (null) na liście, który pojawił się po starcie monitora, oraz wpisy niebędące punktem.
const NULL = [];
for (const [opis, lista] of [['[null]', [null]], ['[Włączenie, null]', [WLACZENIE, null]], ['[null, Włączenie]', [null, WLACZENIE]],
  ['[Kontynuacja, null, Zakończenie]', [KONTYNUACJA, null, ZAKONCZENIE]]]) {
  for (const typ of ['start', 'continue', 'end']) {
    NULL.push({ nazwa: `null ${opis}: karta ${typ} i drugi klik`, opcje: { punkty: [], ghTherapyCalc: KARTA },
      kroki: [modul(lista), zKarty(typ), zKarty(typ)] });
    NULL.push({ nazwa: `null ${opis}: wsteczny ${typ} i drugi klik`, opcje: { punkty: [] },
      kroki: [(a) => a.kliknij('btnGhRetro'), modul(lista), wsteczny({ ghRetroType: typ }, { otworz: false }), klik('btnGhRetroAdd')] });
  }
}
for (const [opis, lista] of [['null przed edytowanym', [null, WLACZENIE, KONTYNUACJA]], ['null za edytowanym', [WLACZENIE, KONTYNUACJA, null]]]) {
  for (const typ of ['start', 'continue', 'end']) {
    NULL.push({ nazwa: `${opis}: edycja ${typ}`, opcje: { punkty: [WLACZENIE, KONTYNUACJA] },
      kroki: [edytuj(KONTYNUACJA.id, { ghEditHeight: '139' }), modul(lista), przycisk(typ), klik('btnGhContinue')] });
  }
}
// (null na liście już przy starcie monitora przerywa start w F() — ta droga nie dotyka kleju i atrapa jej nie odtworzy.)
NULL.push({ nazwa: 'null na liście: usunięcie', opcje: { punkty: [WLACZENIE, KONTYNUACJA] },
  kroki: [modul([WLACZENIE, KONTYNUACJA, null]), (a) => a.usun(KONTYNUACJA.id)] });
// Edycja wiersza bez id: formularz dostaje pełne, poprawne pola, żeby zapis doszedł do przypisania pól wpisu.
const PELNA_EDYCJA = { ghEditDrug: 'Omnitrope 10 mg', ghEditAge: '9', ghEditAgeMonths: '0', ghEditWeight: '32',
  ghEditHeight: '139', ghEditDose: '0.8' };
for (const [opis, wpis] of [['liczba', 5], ['napis', 'x'], ['true', true], ['tablica', []], ['pusty obiekt', {}]]) {
  NULL.push({ nazwa: `wpis ${opis}: karta, wsteczny, edycja wiersza bez id`, opcje: { punkty: [WLACZENIE, wpis], ghTherapyCalc: KARTA },
    kroki: [zKarty('continue'), wsteczny({ ghRetroType: 'continue' }), edytuj('undefined', PELNA_EDYCJA, 'continue')] });
}
// Punkt o id null: sprawdzenie drugiego Włączenia w karcie pomija String(id) === "null" (stan obecny), a wsteczny nie.
const WLACZENIE_BEZ_ID = punkt(null, 'start');
NULL.push({ nazwa: 'Włączenie z id null: karta start, wsteczny start', opcje: { punkty: [WLACZENIE_BEZ_ID], ghTherapyCalc: KARTA },
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
  // Moduł dawki bez funkcji preparat (w aplikacji go nie ma): z modułem punktów bramka wybiera stary kod, więc Increlex
  // nie zapisze się bez × 2 tam, gdzie stary kod rzuca wyjątek.
  { nazwa: 'moduł dawki bez preparat: edycja i wsteczny Increlex', opcje: { punkty: [WLACZENIE, KONTYNUACJA] },
    kroki: [(a) => { a.win.VildaGhDawka = {}; }, edytuj(KONTYNUACJA.id, { ghEditDrug: 'Increlex 40 mg', ghEditDose: '0.5' }, 'continue'),
      wsteczny({ ghRetroProg: 'IGF-1', ghRetroDrug: 'Increlex 40 mg', ghRetroDose: '0.5' })] },
];

describe('Monitor GH: z modułem VildaGhPunkty i bez niego (ścieżka zapasowa) — ten sam wynik', () => {
  it.each([
    ['zapisy i odmowy: karta, wsteczny, edycja, usuwanie', ZWYKLE],
    ['edycja spoza bieżącej listy i zmiana pacjenta', Z3],
    ['pusty wpis (null) i wpisy niebędące punktem', NULL],
    ['zapis i kanał w sytuacjach brzegowych', BRZEGI],
  ])('%s', (_opis, scenariusze) => {
    expect(scenariusze.length).toBeGreaterThan(0);
    for (const s of scenariusze) porownaj(s);
  });
});

describe('Monitor GH z modułem: delegacja do VildaGhPunkty', () => {
  const api = (s, krok = 0) => przebieg(s, TRYB_MODUL, { zlicz: true }).zrzuty[krok].api;

  it('każda ścieżka zapisu woła API, a zapis listy to dokładnie jedno zapisz()', () => {
    expect(api({ opcje: { punkty: [WLACZENIE], ghTherapyCalc: KARTA }, kroki: [zKarty('continue')] }))
      .toEqual(['sprawdzRodzaj', 'jednostkaDawki', 'dniIgf', 'normalizujWiek', 'sprawdzWartosci', 'zapisz']);
    expect(api({ opcje: { punkty: [WLACZENIE] }, kroki: [wsteczny()] }))
      .toEqual(['sprawdzRodzaj', 'polaZPodawanej', 'punkt', 'zapisz']);
    expect(api({ opcje: { punkty: [WLACZENIE, KONTYNUACJA] }, kroki: [edytuj(KONTYNUACJA.id, { ghEditHeight: '139' }, 'continue')] }))
      .toEqual(['sprawdzRodzaj', 'polaZPodawanej', 'zmienWMiejscu', 'zapisz']);
    expect(api({ opcje: { punkty: [WLACZENIE, KONTYNUACJA] }, kroki: [(a) => a.usun(KONTYNUACJA.id)] })).toEqual(['zapisz']);
  });

  it('odmowy: API odmawia, monitor nie zapisuje (bez zapisz)', () => {
    expect(api({ opcje: { punkty: [WLACZENIE], ghTherapyCalc: KARTA }, kroki: [zKarty('start')] })).toEqual(['sprawdzRodzaj']);
    expect(api({ opcje: { punkty: [WLACZENIE] }, kroki: [wsteczny({ ghRetroDose: '0' })] })).toEqual(['sprawdzRodzaj', 'polaZPodawanej']);
    expect(api({ opcje: { punkty: [WLACZENIE, KONTYNUACJA] }, kroki: [edytuj(KONTYNUACJA.id, { ghEditWeight: '0' }, 'continue')] }))
      .toEqual(['sprawdzRodzaj', 'polaZPodawanej']);
  });

  it('edycja spoza bieżącej listy i zmiana pacjenta: odmowa monitora PRZED jakimkolwiek wywołaniem API', () => {
    const usuniety = przebieg({ opcje: { punkty: [WLACZENIE, KONTYNUACJA] },
      kroki: [edytuj(KONTYNUACJA.id, { ghEditWeight: '0' }), modul([WLACZENIE]), klik('btnGhStart')] }, TRYB_MODUL, { zlicz: true }).zrzuty[2];
    expect(usuniety.api).toEqual([]);
    expect(usuniety.komunikat).toBe('Nie zapisano zmian: edytowany punkt nie należy do bieżącej listy punktów. Otwórz edycję ponownie.');
    const pacjent = przebieg({ opcje: { punkty: [WLACZENIE, KONTYNUACJA] },
      kroki: [(a) => ustawPacjenta(a, 'fikc-pacjent-1'), edytuj(KONTYNUACJA.id, { ghEditDrug: '' }), (a) => ustawPacjenta(a, 'fikc-pacjent-2'),
        klik('btnGhContinue')] }, TRYB_MODUL, { zlicz: true }).zrzuty[3];
    expect(pacjent.api).toEqual([]);
    expect(pacjent.dziennik.filter((w) => w.rodzaj === 'M')).toEqual([]);
  });

  it('bramka: API innej wersji (np. rata 1 z pamięci przeglądarki), wyjątek przy odczycie VildaGhPunkty albo moduł dawki bez preparat — monitor wykonuje stary kod', () => {
    const s = { opcje: { punkty: [WLACZENIE] }, kroki: [wsteczny()] };
    const { api: _bezApi, ...odniesienie } = przebieg(s, TRYB_ZAPAS).zrzuty[0];
    for (const podmien of [
      (w) => { const wywolania = []; w.VildaGhPunkty = { wersja: 1, zapisz: () => wywolania.push('zapisz') }; return wywolania; },
      (w) => { Object.defineProperty(w, 'VildaGhPunkty', { get() { throw new Error('fikc'); }, configurable: true }); return []; },
    ]) {
      const atrapa = utworzAtrapeMonitoraGh({ punkty: [WLACZENIE] });
      const wywolania = podmien(atrapa.win);
      atrapa.dodajWsteczny(WSTECZNY);
      expect(wywolania).toEqual([]);
      expect(kanon(zrzut(atrapa, null))).toBe(kanon(odniesienie));
    }
    // Moduł dawki bez preparat: zero wywołań API (wynik obu trybów porównuje scenariusz w „sytuacjach brzegowych”).
    const bezPreparatu = przebieg({ opcje: { punkty: [WLACZENIE] }, kroki: [(a) => { a.win.VildaGhDawka = {}; }, wsteczny()] },
      TRYB_MODUL, { zlicz: true }).zrzuty[1];
    expect(bezPreparatu.api).toEqual([]);
    expect(bezPreparatu.wyjatek).toMatchObject({ blad: 'TypeError' });
  });
});

describe('Monitor GH: łatka P-GH-PUNKTY-API rata 2 w artefakcie', () => {
  it('kod zapasowy jest dosłownie dawnym kodem, a sprawdzenie edycji spoza listy stoi przed bramką modułu', () => {
    const tekst = zrodlo('gh_therapy_monitor.js');
    const he = tekst.slice(tekst.indexOf('function He(e){'), tekst.indexOf('function se('));
    // Blok P-GH-EDYCJA-LISTA zaczyna He, zanim monitor sięgnie po moduł.
    expect(he.indexOf('if(D(),Geb&&x==null){')).toBeGreaterThan(-1);
    expect(he.indexOf('if(D(),Geb&&x==null){')).toBeLessThan(he.indexOf('Gpa()'));
    // Stare reguły zostają w gałęzi zapasowej (jedna kopia każdej).
    for (const fragment of ['window.ghTherapyPoints.some(c=>c.type==="start"&&String(c.id)!==String(x))',
      'const u=window.ghTherapyPoints.findIndex(c=>String(c.id)===String(x));', 'try{ve(window.ghTherapyPoints||[])}',
      'window.ghTherapyPoints.some(function(_){return _.type==="start"})']) {
      expect(tekst.split(fragment).length - 1, fragment).toBe(1);
    }
    // Klej nie łapie wyjątków reguł API (wyjątek ma wyjść jak ze starego kodu).
    const gph = tekst.slice(tekst.indexOf('function Gph('), tekst.indexOf('function Gph(') + 1200);
    expect(gph.slice(0, gph.indexOf('.zmienWMiejscu(') + 1)).not.toMatch(/try\{[^}]*polaZPodawanej/);
  });
});
