import { describe, expect, it } from 'vitest';
import {
  KLUCZ_MODULU, TAB_ID_DOMYSLNY, idDeterministyczne, rodzaje, utworzAtrapeMonitoraGh,
} from '../support/gh-monitor-atrapa.mjs';

// P-GH-PUNKTY-TESTY (T1). Test charakteryzujący PRAWDZIWEGO monitora punktów terapii GH (gh_therapy_monitor.js)
// przed przeniesieniem reguł punktów do wspólnego API: kształt rekordu, normalizacja wieku, odmowy z dokładnymi
// tekstami, kolejność zapisu i sygnałów, dawka z karty i z dawki podawanej, reset i odświeżenie z innej ramki.
// Opisuje DZISIEJSZE zachowanie, także to, które czeka na decyzję właściciela (w nazwie „stan obecny — do decyzji”).
// Atrapa przeglądarki: tests/support/gh-monitor-atrapa.mjs. Wynik karty (window.ghTherapyCalc) podaje test, bo karty
// się nie ładuje. To nie jest test kliniczny: liczby są fikcyjne i dobrane tak, żeby wynik dało się sprawdzić ręcznie.

// 15 kluczy rekordu w kolejności zapisu monitora (mapa punktów GH, §1.1).
const KLUCZE = ['id', 'type', 'ageYears', 'ageMonths', 'weight', 'height', 'boneAge', 'dose', 'doseUnit', 'drug',
  'program', 'igf1', 'igf1Unit', 'igf1DaysSinceDose', 'doseAbs'];

// Komunikaty monitora dosłownie (nakładka #ghInfoOverlay, nagłówek „Informacja”).
const DRUGIE_WLACZENIE = 'Punkt „Włączenie leczenia” został już dodany.';
const DRUGIE_ZAKONCZENIE = 'Punkt „Zakończenie leczenia” został już dodany.';
const DANE = 'Upewnij się, że wprowadziłeś poprawne, dodatnie dane: wiek, wagę, wzrost oraz dawkę.';
const PROGRAM_KARTA = 'Wybierz program i preparat w karcie „Leczenie hormonem wzrostu / IGF-1”.';
const PROGRAM_WSTECZNY = 'Wybierz program i preparat w formularzu wstecznego punktu.';

// Karta po przeliczeniu dla pól domyślnych atrapy: Omnitrope 10 mg, 0,025 mg/kg/d × 32 kg = 0,8 mg/d.
const KARTA = { drug: 'Omnitrope 10 mg', weight: 32, perDayMg: 0.8, perWeekMg: 5.6 };

// Fikcyjny punkt w dzisiejszym kształcie (15 kluczy); nadpisania nie zmieniają kolejności kluczy. Zapis edycji
// przelicza dose = doseAbs / masa, więc wartości bazowe dobrano tak, żeby iloraz był dokładny (0,8 / 32 = 0,025).
const punkt = (id, type, nadpisania = {}) => ({
  id, type, ageYears: 9, ageMonths: 0, weight: 32, height: 130, boneAge: null, dose: 0.025, doseUnit: 'mg/kg/d',
  drug: 'Omnitrope 10 mg', program: 'SNP', igf1: null, igf1Unit: 'ng/mL', igf1DaysSinceDose: null, doseAbs: 0.8,
  ...nadpisania,
});
const WLACZENIE = punkt('fikc-start', 'start');
const KONTYNUACJA = punkt('fikc-kont', 'continue', { ageYears: 10, weight: 36, height: 138, doseAbs: 0.9 });
const ZAKONCZENIE = punkt('fikc-koniec', 'end', { ageYears: 12, weight: 40, height: 150, doseAbs: 1 });

// Poprawny punkt wsteczny (Omnitrope 10 mg, 0,96 mg/d przy 32 kg = 0,03 mg/kg/d); przypadki zmieniają jedno pole.
const WSTECZNY = {
  ghRetroType: 'continue', ghRetroProg: 'SNP', ghRetroDrug: 'Omnitrope 10 mg', ghRetroAge: '9', ghRetroAgeMonths: '6',
  ghRetroWeight: '32', ghRetroHeight: '133', ghRetroDose: '0.96',
};

const komunikat = (tekst) => ({ rodzaj: 'K', naglowek: 'Informacja', tekst });

describe('Nowy punkt z karty (ghAddTherapyPoint, przyciski W/K/Z)', () => {
  it('pełny kształt rekordu: 15 kluczy w kolejności, id jako string, igf1=null, igf1Unit=ng/mL, doseAbs na końcu — Omnitrope 10, Genotropin 12, Ngenla 60, Increlex 40', () => {
    const przypadki = [
      {
        typ: 'start', calc: KARTA, pola: {},
        oczekiwany: { weight: 32, boneAge: null, dose: 0.025, doseUnit: 'mg/kg/d', drug: 'Omnitrope 10 mg', program: 'SNP', doseAbs: 0.8 },
      },
      // Genotropin 12 mg: wynik karty 0,75 mg/d (wielokrotność kroku 0,15 mg); 0,75 / 32 = 0,0234375 mg/kg/d.
      // Wiek kostny z badania tej wizyty (wpisany po wieku) trafia do punktu.
      {
        typ: 'continue', calc: { drug: 'Genotropin 12 mg', weight: 32, perDayMg: 0.75, perWeekMg: 5.25 },
        pola: { therDrug: 'Genotropin 12 mg', advBoneAge: '9.5' },
        oczekiwany: { weight: 32, boneAge: 9.5, dose: 0.0234375, doseUnit: 'mg/kg/d', drug: 'Genotropin 12 mg', program: 'SNP', doseAbs: 0.75 },
      },
      // Ngenla 60 mg: dose = 21 mg/tydz / 32 kg = 0,65625 mg/kg/tydz, doseAbs = 3 mg/d (zawsze mg/d).
      {
        typ: 'end', calc: { drug: 'Ngenla 60 mg', weight: 32, perDayMg: 3, perWeekMg: 21 },
        pola: { therDrug: 'Ngenla 60 mg', therDailyDose: '0.66' },
        oczekiwany: { weight: 32, boneAge: null, dose: 0.65625, doseUnit: 'mg/kg/tydz', drug: 'Ngenla 60 mg', program: 'SNP', doseAbs: 3 },
      },
      // Increlex 40 mg: 1 mg na podanie × 2 = 2 mg/d przy 25 kg → 0,08 mg/kg/d (P-GH-INCRELEX-PODANIE).
      {
        typ: 'start', calc: { drug: 'Increlex 40 mg', weight: 25, perDayMg: 2, perWeekMg: 14 },
        pola: { weight: '25', therProg: 'IGF-1', therDrug: 'Increlex 40 mg', therDailyDose: '0.08', therDailyDoseAbs: '1' },
        oczekiwany: { weight: 25, boneAge: null, dose: 0.08, doseUnit: 'mg/kg/d', drug: 'Increlex 40 mg', program: 'IGF-1', doseAbs: 2 },
      },
    ];
    for (const { typ, calc, pola, oczekiwany } of przypadki) {
      const atrapa = utworzAtrapeMonitoraGh({ ghTherapyCalc: calc });

      const wpisy = atrapa.dodajZKarty(typ, pola);

      expect(rodzaje(wpisy), oczekiwany.drug).toEqual(['E', 'M', 'E', 'BC']);
      const { okno, modul, komunikat: tekst } = atrapa.stan();
      expect(okno, oczekiwany.drug).toHaveLength(1);
      const [p] = okno;
      expect(Object.keys(p), oczekiwany.drug).toEqual(KLUCZE);
      expect(p, oczekiwany.drug).toEqual({
        id: idDeterministyczne(0), type: typ, ageYears: 10, ageMonths: 3, height: 141, igf1: null, igf1Unit: 'ng/mL',
        igf1DaysSinceDose: null, ...oczekiwany,
      });
      expect(typeof p.id).toBe('string');
      expect(Number.isInteger(p.ageYears) && Number.isInteger(p.ageMonths)).toBe(true);
      expect(modul).toEqual(okno);
      expect(tekst).toBeNull();
      expect(atrapa.ostrzezenia).toEqual([]);
    }
  });

  it('dawka ≤ 0 albo pusta w karcie nie daje odmowy: zapis bierze placeholder #therDailyDose; odmowa dopiero bez placeholdera — stan obecny — do decyzji (pytanie 28)', () => {
    // Bez ghTherapyCalc preparat dobowy idzie gałęzią zapasową: dose = placeholder 0,025, doseAbs = 0,025 × 32 = 0,8.
    for (const therDailyDose of ['0', '-1', '']) {
      const atrapa = utworzAtrapeMonitoraGh();

      expect(rodzaje(atrapa.dodajZKarty('start', { therDailyDose })), therDailyDose).toEqual(['E', 'M', 'E', 'BC']);
      const [p] = atrapa.stan().okno;
      expect([p.dose, p.doseAbs], therDailyDose).toEqual([0.025, 0.8]);
    }
    const atrapa = utworzAtrapeMonitoraGh();
    atrapa.pole('therDailyDose').setAttribute('placeholder', '');

    const wpisy = atrapa.dodajZKarty('start', { therDailyDose: '0' });

    expect(rodzaje(wpisy)).toEqual(['E', 'K']);
    expect(wpisy[1]).toEqual(komunikat(DANE));
    expect(atrapa.stan().okno).toEqual([]);
  });
});

describe('Normalizacja wieku', () => {
  // round(lata × 12 + miesiące), potem lata = floor(/12), miesiące = reszta 0–11 (mapa §1.1).
  const PRZYPADKI = [
    { lata: '10', miesiace: '14', wynik: [11, 2] },
    { lata: '9.5', miesiace: '0', wynik: [9, 6] },
    { lata: '10', miesiace: '-1', wynik: [9, 11] },
    { lata: '10', miesiace: '2.6', wynik: [10, 3] },
  ];

  it('karta i punkt wsteczny zapisują 10 l. 14 mies. jako 11 l. 2 mies. (oraz ułamki i ujemne miesiące tą samą regułą)', () => {
    for (const { lata, miesiace, wynik } of PRZYPADKI) {
      const karta = utworzAtrapeMonitoraGh({ ghTherapyCalc: KARTA });
      karta.dodajZKarty('start', { age: lata, ageMonths: miesiace });
      const [z] = karta.stan().okno;
      expect([z.ageYears, z.ageMonths], `karta ${lata}/${miesiace}`).toEqual(wynik);

      const wsteczny = utworzAtrapeMonitoraGh();
      wsteczny.dodajWsteczny({ ...WSTECZNY, ghRetroAge: lata, ghRetroAgeMonths: miesiace });
      const [w] = wsteczny.stan().okno;
      expect([w.ageYears, w.ageMonths], `wsteczny ${lata}/${miesiace}`).toEqual(wynik);
    }
  });
});

describe('Odmowy zapisu', () => {
  it('drugie Włączenie i drugie Zakończenie z karty są odrzucane: [E, K] — E z odczytu D(), bez M i bez BC', () => {
    for (const [typ, tekst] of [['start', DRUGIE_WLACZENIE], ['end', DRUGIE_ZAKONCZENIE]]) {
      const punkty = [WLACZENIE, ZAKONCZENIE];
      const atrapa = utworzAtrapeMonitoraGh({ punkty, ghTherapyCalc: KARTA });
      const przed = atrapa.stan().modulSurowy;

      const wpisy = atrapa.dodajZKarty(typ);

      expect(wpisy, typ).toEqual([
        { rodzaj: 'E', detail: { source: 'gh' }, okno: punkty },
        komunikat(tekst),
      ]);
      expect(atrapa.stan().okno, typ).toEqual(punkty);
      expect(atrapa.stan().modulSurowy, typ).toBe(przed);
      expect(atrapa.stan().powiadomienia, typ).toEqual([]);
    }
  });

  it('drugie Włączenie i drugie Zakończenie we wstecznym: D() czyta moduł przed sprawdzeniem, więc punkt dopisany w innej ramce po otwarciu formularza blokuje zapis', () => {
    // Formularz otwarty przy pustej liście ma aktywne „Włączenie” (i() ustawia je jako wybrane). Inna ramka zapisuje
    // potem Włączenie do modułu; zdarzenie storage odświeża monitor, ale nie formularz.
    const atrapa = utworzAtrapeMonitoraGh();
    atrapa.kliknij('btnGhRetro');
    expect(atrapa.pole('ghRetroType').value).toBe('start');
    atrapa.ustawModul([WLACZENIE]);
    atrapa.zdarzenieOkna('storage', { key: 'ghTherapyPoints' });

    const { ghRetroType: _pominiety, ...bezTypu } = WSTECZNY;
    const wpisy = atrapa.dodajWsteczny(bezTypu, { otworz: false });

    expect(wpisy).toEqual([{ rodzaj: 'E', detail: { source: 'gh' }, okno: [WLACZENIE] }, komunikat(DRUGIE_WLACZENIE)]);
    expect(atrapa.stan().okno).toEqual([WLACZENIE]);
    expect(atrapa.stan().wstecznyWidoczny).toBe(true);

    // To samo dla Zakończenia: formularz otwarty, gdy końca nie było, a koniec dopisany z innej ramki.
    const druga = utworzAtrapeMonitoraGh({ punkty: [WLACZENIE] });
    druga.kliknij('btnGhRetro');
    druga.ustawModul([WLACZENIE, ZAKONCZENIE]);
    druga.zdarzenieOkna('storage', { key: 'ghTherapyPoints' });

    const wpisyKonca = druga.dodajWsteczny({ ...WSTECZNY, ghRetroType: 'end' }, { otworz: false });

    expect(rodzaje(wpisyKonca)).toEqual(['E', 'K']);
    expect(wpisyKonca[1]).toEqual(komunikat(DRUGIE_ZAKONCZENIE));
    expect(druga.stan().okno).toEqual([WLACZENIE, ZAKONCZENIE]);
  });

  it('edycja Włączenia przyciskiem „Włączenie” nie jest odrzucana: sprawdzenie pomija edytowany id', () => {
    const atrapa = utworzAtrapeMonitoraGh({ punkty: [WLACZENIE, KONTYNUACJA] });

    const wpisy = atrapa.edytuj(WLACZENIE.id, { ghEditHeight: '131' }, 'start');

    expect(rodzaje(wpisy)).toEqual(['E', 'M', 'E', 'BC']);
    expect(atrapa.stan().okno[0]).toMatchObject({ id: WLACZENIE.id, type: 'start', height: 131 });
  });

  it('karta: wiek 0, masa i wzrost ≤ 0, pusty program albo preparat — [E, K] z dokładnym tekstem, lista bez zmian', () => {
    const przypadki = [
      [{ age: '0', ageMonths: '0' }, DANE],
      [{ age: '' }, DANE],
      [{ weight: '0' }, DANE],
      [{ weight: '-1' }, DANE],
      [{ height: '0' }, DANE],
      [{ height: '-1' }, DANE],
      [{ therProg: '' }, PROGRAM_KARTA],
      [{ therDrug: '' }, PROGRAM_KARTA],
    ];
    for (const [pola, tekst] of przypadki) {
      const opis = JSON.stringify(pola);
      const atrapa = utworzAtrapeMonitoraGh({ ghTherapyCalc: KARTA });

      const wpisy = atrapa.dodajZKarty('start', pola);

      expect(wpisy, opis).toEqual([{ rodzaj: 'E', detail: { source: 'gh' }, okno: [] }, komunikat(tekst)]);
      expect(atrapa.stan().komunikat, opis).toBe(tekst);
      expect(atrapa.stan().okno, opis).toEqual([]);
      expect(atrapa.stan().modul, opis).toBeUndefined();
    }
  });

  it('wsteczny: wiek 0, masa, wzrost i dawka ≤ 0 albo pusta, pusty program albo preparat — [E(otwarcie), E, K], formularz zostaje', () => {
    const przypadki = [
      [{ ghRetroAge: '0', ghRetroAgeMonths: '0' }, DANE],
      [{ ghRetroWeight: '0' }, DANE],
      [{ ghRetroWeight: '-1' }, DANE],
      [{ ghRetroHeight: '0' }, DANE],
      [{ ghRetroHeight: '-1' }, DANE],
      [{ ghRetroDose: '0' }, DANE],
      [{ ghRetroDose: '-1' }, DANE],
      [{ ghRetroDose: '' }, DANE],
      [{ ghRetroProg: '' }, PROGRAM_WSTECZNY],
      [{ ghRetroDrug: '' }, PROGRAM_WSTECZNY],
    ];
    for (const [zmiana, tekst] of przypadki) {
      const opis = JSON.stringify(zmiana);
      const atrapa = utworzAtrapeMonitoraGh();

      const wpisy = atrapa.dodajWsteczny({ ...WSTECZNY, ...zmiana });

      expect(rodzaje(wpisy), opis).toEqual(['E', 'E', 'K']);
      expect(wpisy[2], opis).toEqual(komunikat(tekst));
      expect(atrapa.stan().okno, opis).toEqual([]);
      expect(atrapa.stan().wstecznyWidoczny, opis).toBe(true);
    }
  });
});

describe('Kolejność zapisu i sygnałów (L) oraz tabId kanału gh-therapy-sync', () => {
  it('karta: E(odczyt) → ghRecalcTherapy → M {force:true} → E → BC {update, tabId}; moduł jest zapisany przed E, a okno w E równa się modułowi', () => {
    const ref = {};
    const atrapa = utworzAtrapeMonitoraGh({
      punkty: [WLACZENIE], ghTherapyCalc: KARTA, ghRecalcTherapy: () => ref.atrapa.dziennik.push({ rodzaj: 'R' }),
    });
    ref.atrapa = atrapa;

    const wpisy = atrapa.dodajZKarty('continue');

    expect(rodzaje(wpisy)).toEqual(['E', 'R', 'M', 'E', 'BC']);
    const lista = atrapa.stan().okno;
    expect(lista.map((p) => p.id)).toEqual([WLACZENIE.id, idDeterministyczne(0)]);
    expect(wpisy[0]).toEqual({ rodzaj: 'E', detail: { source: 'gh' }, okno: [WLACZENIE] });
    expect(wpisy[2]).toEqual({ rodzaj: 'M', klucz: KLUCZ_MODULU, wartosc: lista, opcje: { force: true } });
    expect(wpisy[3]).toEqual({ rodzaj: 'E', detail: { source: 'gh' }, okno: lista });
    expect(wpisy[4]).toEqual({ rodzaj: 'BC', kanal: 'gh-therapy-sync', wiadomosc: { type: 'update', tabId: TAB_ID_DOMYSLNY } });
    expect(atrapa.stan().modul).toEqual(lista);
    expect(atrapa.stan().powiadomienia).toEqual(['gh-point-saved']);
  });

  it('wsteczny i edycja kończą się tym samym ogonem M → E → BC; otwarcie formularza wstecznego daje E, otwarcie edycji nie daje sygnału', () => {
    const wsteczny = utworzAtrapeMonitoraGh();
    const wpisyW = wsteczny.dodajWsteczny(WSTECZNY);
    expect(rodzaje(wpisyW)).toEqual(['E', 'E', 'M', 'E', 'BC']);
    expect(wpisyW[4].wiadomosc).toEqual({ type: 'update', tabId: TAB_ID_DOMYSLNY });
    expect(wsteczny.stan().powiadomienia).toEqual(['gh-retro-point-added']);
    expect(wsteczny.stan().wstecznyWidoczny).toBe(false);

    const edycja = utworzAtrapeMonitoraGh({ punkty: [WLACZENIE] });
    expect(edycja.edytuj(WLACZENIE.id)).toEqual([]);
    edycja.ustaw('ghEditHeight', '131');
    const od = edycja.dziennik.length;
    edycja.kliknij('btnGhStart');
    const wpisyE = edycja.dziennik.slice(od);
    expect(rodzaje(wpisyE)).toEqual(['E', 'M', 'E', 'BC']);
    expect(wpisyE[1].opcje).toEqual({ force: true });
    expect(wpisyE[3].wiadomosc).toEqual({ type: 'update', tabId: TAB_ID_DOMYSLNY });
    expect(edycja.stan().powiadomienia).toEqual(['gh-point-saved']);
  });

  it('tabId: najpierw VildaPersistence.getTabId(), bez niej sessionStorage.vildaTabIdV1, potem ""; wyjątek getTabId daje wiadomość bez pola tabId', () => {
    const przypadki = [
      [{ sesjaTabId: 'fikcyjna-sesja-2' }, { type: 'update', tabId: TAB_ID_DOMYSLNY }],
      [{ getTabId: null, sesjaTabId: 'fikcyjna-sesja-2' }, { type: 'update', tabId: 'fikcyjna-sesja-2' }],
      [{ getTabId: null }, { type: 'update', tabId: '' }],
      // getTabId zwracające "" nie sięga już do sesji.
      [{ getTabId: '', sesjaTabId: 'fikcyjna-sesja-2' }, { type: 'update', tabId: '' }],
      [{ getTabId: () => { throw new Error('fikcyjny błąd'); }, sesjaTabId: 'fikcyjna-sesja-2' }, { type: 'update' }],
    ];
    for (const [opcje, wiadomosc] of przypadki) {
      const atrapa = utworzAtrapeMonitoraGh({ ghTherapyCalc: KARTA, ...opcje });

      const wpisy = atrapa.dodajZKarty('start');

      expect(wpisy.at(-1), JSON.stringify(wiadomosc)).toEqual({ rodzaj: 'BC', kanal: 'gh-therapy-sync', wiadomosc });
      expect(Object.keys(wpisy.at(-1).wiadomosc)).toEqual(Object.keys(wiadomosc));
    }
  });
});

describe('Punkt wsteczny — dawka z dawki podawanej', () => {
  it('Ngenla 60 mg: dose = wpis / masa w mg/kg/tydz, doseAbs = wpis / 7 (mg/d), IGF-1 bez dni → 4 dni; preparat dobowy zostawia dni puste', () => {
    const ngenla = { ...WSTECZNY, ghRetroDrug: 'Ngenla 60 mg', ghRetroDose: '21', ghRetroIgf1: '250' };
    const atrapa = utworzAtrapeMonitoraGh();

    atrapa.dodajWsteczny(ngenla);

    const [p] = atrapa.stan().okno;
    expect(Object.keys(p)).toEqual(KLUCZE);
    expect(p).toEqual({
      id: idDeterministyczne(0), type: 'continue', ageYears: 9, ageMonths: 6, weight: 32, height: 133, boneAge: null,
      dose: 0.65625, doseUnit: 'mg/kg/tydz', drug: 'Ngenla 60 mg', program: 'SNP',
      igf1: 250, igf1Unit: 'ng/mL', igf1DaysSinceDose: 4, doseAbs: 3,
    });

    // Podane dni zostają bez zmian.
    const zDniami = utworzAtrapeMonitoraGh();
    zDniami.dodajWsteczny({ ...ngenla, ghRetroIgfDays: '2' });
    expect(zDniami.stan().okno[0].igf1DaysSinceDose).toBe(2);

    // Omnitrope 10 mg: 0,96 mg/d przy 32 kg = 0,03 mg/kg/d; IGF-1 bez dni → dni null.
    const dobowy = utworzAtrapeMonitoraGh();
    dobowy.dodajWsteczny({ ...WSTECZNY, ghRetroIgf1: '250' });
    expect(dobowy.stan().okno[0]).toMatchObject({
      dose: 0.03, doseUnit: 'mg/kg/d', doseAbs: 0.96, igf1: 250, igf1DaysSinceDose: null,
    });
  });
});

describe('Gmcalc — dawka nowego punktu z wyniku karty i gałąź zapasowa', () => {
  it('masa w ghTherapyCalc różna od masy punktu: preparat dobowy bierze #therDailyDoseAbs albo dawkę × masę; Ngenla i Increlex liczą z dawki na kg i pomijają #therDailyDoseAbs', () => {
    const przypadki = [
      {
        opis: 'Omnitrope, masa karty 30 kg, pole mg/d wypełnione',
        calc: { ...KARTA, weight: 30 }, pola: { therDailyDoseAbs: '0.9' }, wynik: { dose: 0.025, doseAbs: 0.9 },
      },
      {
        opis: 'Omnitrope, masa karty 30 kg, pole mg/d puste: 0,025 × 32',
        calc: { ...KARTA, weight: 30 }, pola: {}, wynik: { dose: 0.025, doseAbs: 0.8 },
      },
      {
        opis: 'Omnitrope, wynik karty dla innego preparatu',
        calc: { ...KARTA, drug: 'Omnitrope 5 mg' }, pola: {}, wynik: { dose: 0.025, doseAbs: 0.8 },
      },
      {
        // 0,56 mg/kg/tydz ÷ 7 × 25 kg = 2 mg/d; wpis 14 w #therDailyDoseAbs nie jest używany.
        opis: 'Ngenla 60, masa karty 24 kg',
        calc: { drug: 'Ngenla 60 mg', weight: 24, perDayMg: 2, perWeekMg: 14 },
        pola: { weight: '25', therDrug: 'Ngenla 60 mg', therDailyDose: '0.56', therDailyDoseAbs: '14' },
        wynik: { dose: 0.56, doseUnit: 'mg/kg/tydz', doseAbs: 2 },
      },
      {
        // 0,08 mg/kg/d × 25 kg = 2 mg/d; wpis 1 (dawka na podanie) w #therDailyDoseAbs nie jest używany.
        opis: 'Increlex 40, masa karty 24 kg',
        calc: { drug: 'Increlex 40 mg', weight: 24, perDayMg: 2, perWeekMg: 14 },
        pola: { weight: '25', therProg: 'IGF-1', therDrug: 'Increlex 40 mg', therDailyDose: '0.08', therDailyDoseAbs: '1' },
        wynik: { dose: 0.08, doseUnit: 'mg/kg/d', doseAbs: 2 },
      },
    ];
    for (const { opis, calc, pola, wynik } of przypadki) {
      const atrapa = utworzAtrapeMonitoraGh({ ghTherapyCalc: calc });

      expect(rodzaje(atrapa.dodajZKarty('start', pola)), opis).toEqual(['E', 'M', 'E', 'BC']);
      const [p] = atrapa.stan().okno;
      expect(p, opis).toMatchObject(wynik);
      expect(Object.keys(p), opis).toEqual(KLUCZE);
    }
  });

  it('Increlex bez VildaGhDawka: wsteczny zapisuje wpis bez ×2 (etykieta „mg/dobę”), a punkt z karty bierze doseAbs z pola dawki na podanie mimo zgodnego wyniku karty — stan obecny — do decyzji (pytanie 27)', () => {
    const increlex = {
      ...WSTECZNY, ghRetroProg: 'IGF-1', ghRetroDrug: 'Increlex 40 mg', ghRetroWeight: '25', ghRetroDose: '1',
    };
    // Z modułem dawki: 1 mg na podanie × 2 = 2 mg/d przy 25 kg → 0,08 mg/kg/d.
    const zModulem = utworzAtrapeMonitoraGh();
    zModulem.dodajWsteczny(increlex);
    expect(zModulem.pole('ghRetroDoseLabel').textContent).toBe('Dawka na podanie, 2× na dobę (mg)');
    expect(zModulem.stan().okno[0]).toMatchObject({ dose: 0.08, doseUnit: 'mg/kg/d', doseAbs: 2 });

    // Bez modułu: ten sam wpis jest dawką dobową — połowa dawki z modułem.
    const bezModulu = utworzAtrapeMonitoraGh({ modulDawki: false });
    expect(bezModulu.win.VildaGhDawka).toBeUndefined();
    expect(rodzaje(bezModulu.dodajWsteczny(increlex))).toEqual(['E', 'E', 'M', 'E', 'BC']);
    expect(bezModulu.pole('ghRetroDoseLabel').textContent).toBe('Dawka podawana (mg/dobę)');
    expect(bezModulu.stan().okno[0]).toMatchObject({ dose: 0.04, doseUnit: 'mg/kg/d', doseAbs: 1 });

    // Karta bez modułu: Gmcalc nie działa, doseAbs = #therDailyDoseAbs (pole „Dawka na podanie” karty Increlex).
    const karta = utworzAtrapeMonitoraGh({
      modulDawki: false, ghTherapyCalc: { drug: 'Increlex 40 mg', weight: 25, perDayMg: 2, perWeekMg: 14 },
    });
    karta.dodajZKarty('start', {
      weight: '25', therProg: 'IGF-1', therDrug: 'Increlex 40 mg', therDailyDose: '0.08', therDailyDoseAbs: '1',
    });
    expect(karta.stan().okno[0]).toMatchObject({ dose: 0.08, doseUnit: 'mg/kg/d', doseAbs: 1 });
  });
});

describe('Reset monitora i odświeżenie z innej ramki', () => {
  it('vilda:user-state-cleared: lista [], removeModuleKey i BC {clear, tabId}, bez bezpośredniego E; #therProg zostaje zablokowany — stan obecny — do decyzji (pytanie 16)', () => {
    const atrapa = utworzAtrapeMonitoraGh({ punkty: [WLACZENIE, KONTYNUACJA] });
    atrapa.wyczyscDziennik();

    const wpisy = atrapa.zdarzenieOkna('vilda:user-state-cleared');

    expect(wpisy).toEqual([
      { rodzaj: 'RM', klucz: KLUCZ_MODULU },
      { rodzaj: 'BC', kanal: 'gh-therapy-sync', wiadomosc: { type: 'clear', tabId: TAB_ID_DOMYSLNY } },
    ]);
    const s = atrapa.stan();
    expect(s.okno).toEqual([]);
    expect(s.modul).toBeUndefined();
    expect(atrapa.idWierszy()).toEqual([]);
    expect(s.znaczniki.at(-1)).toEqual(['toggleIgfTests', 0]);
    // #therProg zostaje zablokowany (gałąź odblokowania w F() jest nieosiągalna przy pustej liście).
    expect(atrapa.pole('therProg').disabled).toBe(true);
  });

  it('vilda:module-state-cleared resetuje monitor dla zakresu gh, all, * i bez zakresu; zakres innego modułu nic nie robi', () => {
    for (const [detail, oczekiwane] of [
      [{ scope: 'gh' }, ['RM', 'BC']],
      [{ scope: 'all' }, ['RM', 'BC']],
      [{ scope: '*' }, ['RM', 'BC']],
      [{}, ['RM', 'BC']],
      [{ scope: 'obesity' }, []],
    ]) {
      const atrapa = utworzAtrapeMonitoraGh({ punkty: [WLACZENIE] });

      const wpisy = atrapa.zdarzenieOkna('vilda:module-state-cleared', { detail });

      expect(rodzaje(wpisy), JSON.stringify(detail)).toEqual(oczekiwane);
      expect(atrapa.stan().okno, JSON.stringify(detail)).toEqual(oczekiwane.length ? [] : [WLACZENIE]);
    }
  });

  it('storage z kluczem zawierającym ghTherapyPoints (także veph:s:) albo bez klucza: D() czyta moduł → E i tabela; inny klucz nic nie robi', () => {
    const atrapa = utworzAtrapeMonitoraGh({ punkty: [WLACZENIE] });
    // Inna ramka tej karty zapisała do modułu dłuższą listę.
    atrapa.ustawModul([WLACZENIE, KONTYNUACJA]);

    expect(atrapa.zdarzenieOkna('storage', { key: 'obesityTherapyPoints' })).toEqual([]);
    expect(atrapa.stan().okno).toEqual([WLACZENIE]);

    for (const key of ['ghTherapyPoints', 'veph:s:ghTherapyPoints', null]) {
      const wpisy = atrapa.zdarzenieOkna('storage', { key });

      expect(wpisy, String(key)).toEqual([{ rodzaj: 'E', detail: { source: 'gh' }, okno: [WLACZENIE, KONTYNUACJA] }]);
      expect(atrapa.idWierszy(), String(key)).toEqual([WLACZENIE.id, KONTYNUACJA.id]);
    }
  });
});

describe('Edycja istniejącego punktu', () => {
  // Punkt środkowy w starym kształcie: bez doseAbs, z obcym polem w środku i z programem innym niż Włączenie.
  const SRODKOWY = {
    id: 'fikc-srodek', type: 'continue', ageYears: 9, ageMonths: 6, notatkaTestowa: 'fikcyjne obce pole', weight: 30,
    height: 133, boneAge: 8, dose: 0.03, doseUnit: 'mg/kg/d', drug: 'Omnitrope 10 mg', program: 'PWS',
    igf1: 310, igf1Unit: 'ng/mL', igf1DaysSinceDose: null,
  };

  it('program z #therProg, czyli z punktu Włączenia (R9) — stan obecny — do decyzji (pytanie 17); typ z przycisku; id, pozycja, obce pole i kolejność kluczy zostają, doseAbs dopisane na końcu', () => {
    const atrapa = utworzAtrapeMonitoraGh({ punkty: [WLACZENIE, SRODKOWY, KONTYNUACJA] });

    atrapa.edytuj(SRODKOWY.id);
    // O() wpisuje program punktu, ale F() zaraz nadpisuje #therProg programem Włączenia i blokuje pole.
    expect(atrapa.pole('therProg').value).toBe('SNP');
    expect(atrapa.pole('therProg').disabled).toBe(true);
    // Dawka podawana w formularzu: bez doseAbs liczona z dose × masa (0,03 × 30).
    expect(atrapa.pole('ghEditDose').value).toBe('0.9');
    atrapa.ustaw('ghEditWeight', '32');
    atrapa.ustaw('ghEditDose', '0.96');
    const od = atrapa.dziennik.length;
    atrapa.kliknij('btnGhEnd');

    expect(rodzaje(atrapa.dziennik.slice(od))).toEqual(['E', 'M', 'E', 'BC']);
    const s = atrapa.stan();
    expect(s.okno.map((p) => p.id)).toEqual([WLACZENIE.id, SRODKOWY.id, KONTYNUACJA.id]);
    expect(s.okno[0]).toEqual(WLACZENIE);
    expect(s.okno[2]).toEqual(KONTYNUACJA);
    expect(Object.keys(s.okno[1])).toEqual([...Object.keys(SRODKOWY), 'doseAbs']);
    expect(s.okno[1]).toEqual({
      ...SRODKOWY, type: 'end', weight: 32, dose: 0.03, program: 'SNP', doseAbs: 0.96,
    });
    expect(s.modul).toEqual(s.okno);
    expect(s.edycjaWidoczna).toBe(false);
  });

  it('Ngenla 60 mg: formularz pokazuje dawkę tygodniową (doseAbs × 7), zapis daje dose = wpis / masa i doseAbs = wpis / 7, a IGF-1 bez dni → 4 dni', () => {
    const ngenla = punkt('fikc-ngenla', 'continue', {
      dose: 0.65625, doseUnit: 'mg/kg/tydz', drug: 'Ngenla 60 mg', doseAbs: 3,
    });
    const atrapa = utworzAtrapeMonitoraGh({ punkty: [ngenla] });

    atrapa.edytuj(ngenla.id);
    expect(atrapa.pole('ghEditDose').value).toBe('21');
    atrapa.ustaw('ghEditDose', '24');
    atrapa.ustaw('ghEditIgf1', '250');
    atrapa.kliknij('btnGhContinue');

    // 24 mg/tydz przy 32 kg = 0,75 mg/kg/tydz; 24 ÷ 7 = 3,4285714… mg/d (zapis bez zaokrąglania).
    expect(atrapa.stan().okno).toEqual([{
      ...ngenla, dose: 0.75, doseAbs: 3.4285714285714284, igf1: 250, igf1DaysSinceDose: 4,
    }]);
  });

  it('bez punktu Włączenia program pochodzi z pierwszego punktu po sortowaniu (typ, potem wiek) — stan obecny — do decyzji (pytanie 17)', () => {
    const mlodszy = punkt('fikc-mlodszy', 'continue', { ageYears: 8, program: 'PWS' });
    const starszy = punkt('fikc-starszy', 'continue', { ageYears: 10, program: 'SNP' });
    // Kolejność w tablicy: starszy przed młodszym; F() sortuje po wieku.
    const atrapa = utworzAtrapeMonitoraGh({ punkty: [starszy, mlodszy] });

    const wpisy = atrapa.edytuj(starszy.id, { ghEditHeight: '137' }, 'continue');

    expect(rodzaje(wpisy)).toEqual(['E', 'M', 'E', 'BC']);
    expect(atrapa.stan().okno).toEqual([{ ...starszy, height: 137, program: 'PWS' }, mlodszy]);
  });
});
