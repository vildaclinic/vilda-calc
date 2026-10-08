import { describe, expect, it } from 'vitest';
import { loadBrowserScript } from '../support/load-browser-script.mjs';

// P-GH-PUNKT-Z-WIERSZA (D8). Funkcje czyste modułu vilda_gh_punkt_z_wiersza.js na prawdziwych VildaGhPunkty
// i VildaGhDawka (bez DOM — zachowanie panelu na Start sprawdza tests/e2e/gh-punkt-z-wiersza.spec.mjs).
// Punkt powstaje regułami punktu wstecznego (VildaGhPunkty.polaZPodawanej('wsteczny')), więc przypadki
// „wejście → oczekiwany wynik” liczą dawkę tak jak formularz wsteczny monitora DocPro. Dane wyłącznie FIKCYJNE.

const w = { document: { readyState: 'complete', getElementById: () => null, addEventListener: () => {} } };
for (const plik of ['vilda_gh_opakowania_dane.js', 'vilda_gh_dawka_dane.js', 'vilda_gh_dawka.js', 'vilda_gh_punkty.js',
  'vilda_gh_programy_dane.js', 'vilda_gh_punkt_z_wiersza.js']) loadBrowserScript(plik, w);
const M = w.VildaGhPunktZWiersza;
const A = w.VildaGhPunkty;
const E = w.VildaGhDawka;
const D = w.VildaGhProgramyDane;

const punkt = (id, type, nadpisania = {}) => ({
  id, type, ageYears: 8, ageMonths: 0, weight: 25, height: 122, boneAge: null, dose: 0.028, doseUnit: 'mg/kg/d',
  drug: 'Omnitrope 10 mg', program: 'SNP', igf1: null, igf1Unit: 'ng/mL', igf1DaysSinceDose: null, doseAbs: 0.7,
  ...nadpisania,
});
const WLACZENIE = punkt('fikc-1', 'start');
const KONTYNUACJA = punkt('fikc-2', 'continue', { ageMonths: 6, weight: 27, height: 125.5, doseAbs: 0.8 });
const WIERSZ = { lata: '9', miesiace: '0', wzrost: '128.6', masa: '29.1', wiekKostny: '' };

describe('pomiarWiersza i stanPrzycisku', () => {
  it('kompletny pomiar: liczby z napisów pól, wiek w miesiącach; pusty miesiąc = 0', () => {
    expect(M.pomiarWiersza(WIERSZ)).toMatchObject({ lata: 9, miesiace: 0, wzrost: 128.6, masa: 29.1, wiekKostny: null, kompletny: true, wiekMies: 108 });
    expect(M.pomiarWiersza({ ...WIERSZ, miesiace: '' })).toMatchObject({ miesiace: 0, kompletny: true });
    expect(M.pomiarWiersza({ ...WIERSZ, wiekKostny: '9,5' }).wiekKostny).toBe(9.5);
  });

  it.each([
    ['brak wzrostu', { wzrost: '' }], ['masa 0', { masa: '0' }], ['wiek 0 l. 0 mies.', { lata: '0', miesiace: '0' }], ['brak wieku', { lata: '' }],
  ])('niekompletny pomiar (%s): przycisk widoczny, nieaktywny, z powodem', (_n, zmiana) => {
    const p = M.pomiarWiersza({ ...WIERSZ, ...zmiana });
    expect(p.kompletny).toBe(false);
    expect(M.stanPrzycisku([WLACZENIE], p, true)).toEqual({ widoczny: true, aktywny: false, powod: 'Uzupełnij wiek, wzrost i masę w tym wierszu.' });
  });

  it('bez punktu Włączenia albo bez gotowych modułów — przycisku nie ma (decyzja właściciela 2026-10-07)', () => {
    const p = M.pomiarWiersza(WIERSZ);
    const brak = { widoczny: false, aktywny: false, powod: null };
    expect(M.stanPrzycisku([], p, true)).toEqual(brak);
    expect(M.stanPrzycisku([KONTYNUACJA], p, true)).toEqual(brak);
    expect(M.stanPrzycisku([WLACZENIE], p, false)).toEqual(brak);
    expect(M.stanPrzycisku([null, 5], p, true)).toEqual(brak);
    // Pusty wiersz (karta zawsze ma jeden do wpisania pomiaru) — bez przycisku.
    const pusty = M.pomiarWiersza({ lata: '', miesiace: '', wzrost: '', masa: '', wiekKostny: '' });
    expect(pusty.pusty).toBe(true);
    expect(M.stanPrzycisku([WLACZENIE], pusty, true)).toEqual(brak);
  });

  it('w tym miesiącu wieku jest już punkt — przycisk nieaktywny; inny miesiąc — aktywny', () => {
    expect(M.stanPrzycisku([WLACZENIE, KONTYNUACJA], M.pomiarWiersza({ ...WIERSZ, lata: '8', miesiace: '6' }), true))
      .toEqual({ widoczny: true, aktywny: false, powod: 'W tym miesiącu wieku jest już punkt leczenia GH.' });
    expect(M.stanPrzycisku([WLACZENIE, KONTYNUACJA], M.pomiarWiersza(WIERSZ), true)).toEqual({ widoczny: true, aktywny: true, powod: null });
  });
});

describe('tekstPomiaru — podsumowanie bieżącego pomiaru w panelu (P-GH-PUNKT-Z-WIERSZA-ZGODNOSC)', () => {
  it('kompletny pomiar: ten sam tekst co przy otwarciu panelu (przecinek dziesiętny, wiek kostny „—”)', () => {
    expect(M.tekstPomiaru(M.pomiarWiersza({ lata: '9', miesiace: '0', wzrost: '128.6', masa: '29.1', wiekKostny: '' })))
      .toBe('Wiek 9 l. 0 mies. · wzrost 128,6 cm · masa 29,1 kg · wiek kostny —');
    expect(M.tekstPomiaru(M.pomiarWiersza({ lata: '9', miesiace: '', wzrost: '128,6', masa: '20', wiekKostny: '9.5' })))
      .toBe('Wiek 9 l. 0 mies. · wzrost 128,6 cm · masa 20 kg · wiek kostny 9,5 l.');
  });

  it('brakujące pole jako „—” — panel pokazuje niekompletny wiersz, którego zapis jest zablokowany', () => {
    const pm = M.pomiarWiersza({ lata: '9', miesiace: '0', wzrost: '128.6', masa: '', wiekKostny: '' });
    expect(M.tekstPomiaru(pm)).toBe('Wiek 9 l. 0 mies. · wzrost 128,6 cm · masa — · wiek kostny —');
    expect(M.stanPrzycisku([{ id: 'a', type: 'start', ageYears: 8, ageMonths: 0 }], pm, true))
      .toEqual({ widoczny: true, aktywny: false, powod: M.TEKSTY.niekompletny });
    expect(M.tekstPomiaru(M.pomiarWiersza({}))).toBe('Wiek — · wzrost — · masa — · wiek kostny —');
  });

  it('komunikat odmowy, gdy wiersz różni się od pokazanego pomiaru', () => {
    expect(M.TEKSTY.pomiarZmieniony).toBe('Pomiar w wierszu się zmienił. Sprawdź dane w panelu i zapisz ponownie.');
  });
});

describe('wartości domyślne panelu i etykiety', () => {
  it('program i preparat ostatniego punktu (najstarszy wiek, nie ostatni na liście)', () => {
    const starszy = punkt('fikc-3', 'continue', { ageYears: 10, program: 'ZT', drug: 'Genotropin 12 mg' });
    expect(M.domyslne([WLACZENIE, starszy, KONTYNUACJA], D)).toMatchObject({ program: 'ZT', preparat: 'Genotropin 12 mg', punkt: starszy });
  });

  it('program spoza danych — pierwszy program (preparat zostaje, jeśli jest w tym programie); preparat spoza programu — pierwszy preparat programu', () => {
    expect(M.domyslne([punkt('x', 'start', { program: 'NIEZNANY' })], D)).toMatchObject({ program: 'SNP', preparat: 'Omnitrope 10 mg' });
    expect(M.domyslne([punkt('x', 'start', { program: 'NIEZNANY', drug: 'Increlex 40 mg' })], D)).toMatchObject({ program: 'SNP', preparat: 'Omnitrope 5 mg' });
    expect(M.domyslne([punkt('x', 'start', { program: 'IGF-1', drug: 'Omnitrope 10 mg' })], D)).toMatchObject({ program: 'IGF-1', preparat: 'Increlex 40 mg' });
    expect(M.domyslne([], D)).toMatchObject({ program: 'SNP', preparat: 'Omnitrope 5 mg', punkt: null });
  });

  it('pole dawki jak w formularzu wstecznym monitora: etykieta i przykład według schematu preparatu', () => {
    expect(M.poleDawki(M.schematPreparatu(E, 'Omnitrope 10 mg'))).toEqual({ etykieta: 'Dawka podawana (mg/dobę)', przyklad: 'np. 0,9' });
    expect(M.poleDawki(M.schematPreparatu(E, 'Ngenla 60 mg'))).toEqual({ etykieta: 'Dawka podawana (mg/tydzień)', przyklad: 'np. 4,9' });
    expect(M.poleDawki(M.schematPreparatu(E, 'Increlex 40 mg'))).toEqual({ etykieta: 'Dawka na podanie, 2× na dobę (mg)', przyklad: 'np. 0,8' });
    expect(M.schematPreparatu(null, 'Ngenla 60 mg')).toBe('dobowy');
  });

  it('etykieta wiersza punktu GH', () => {
    expect(M.etykietaWierszaGh(WLACZENIE)).toBe('Punkt leczenia GH · Włączenie leczenia · poprawki w DocPro');
    expect(M.etykietaWierszaGh(KONTYNUACJA)).toBe('Punkt leczenia GH · Kontynuacja leczenia · poprawki w DocPro');
    expect(M.etykietaWierszaGh({ type: 'end' })).toBe('Punkt leczenia GH · Zakończenie leczenia · poprawki w DocPro');
    expect(M.etykietaWierszaGh(null)).toBe('Punkt leczenia GH · punkt · poprawki w DocPro');
  });
});

describe('przygotujPunkt — reguły punktu wstecznego z VildaGhPunkty (wejście → oczekiwany wynik)', () => {
  const L = [WLACZENIE, KONTYNUACJA];
  const pomiar = M.pomiarWiersza(WIERSZ);
  const wybor = (z) => ({ typ: 'continue', program: 'SNP', preparat: 'Omnitrope 10 mg', podawana: '0.9', igf1: '', dniIgf: '', ...z });

  it('Omnitrope 10 mg, 0,9 mg/d, 29,1 kg → dose 0,9/29,1 mg/kg/d, doseAbs 0,9 mg/d; pomiar z wiersza; rekord 15 kluczy', () => {
    const w1 = M.przygotujPunkt(A, L, pomiar, wybor());
    expect(w1.ok).toBe(true);
    expect(Object.keys(w1.punkt)).toEqual(A.KLUCZE);
    expect(w1.punkt).toMatchObject({
      type: 'continue', ageYears: 9, ageMonths: 0, weight: 29.1, height: 128.6, boneAge: null,
      dose: 0.9 / 29.1, doseUnit: 'mg/kg/d', drug: 'Omnitrope 10 mg', program: 'SNP', igf1: null, igf1Unit: 'ng/mL',
      igf1DaysSinceDose: null, doseAbs: 0.9,
    });
    expect(typeof w1.punkt.id).toBe('string');
  });

  it('Ngenla 60 mg, 20 mg/tydz, IGF-1 250 bez dni → dose 20/29,1 mg/kg/tydz, doseAbs 20/7 mg/d, 4 dni od dawki', () => {
    const w1 = M.przygotujPunkt(A, L, pomiar, wybor({ preparat: 'Ngenla 60 mg', podawana: '20', igf1: '250' }));
    expect(w1.punkt).toMatchObject({ dose: 20 / 29.1, doseUnit: 'mg/kg/tydz', doseAbs: 20 / 7, igf1: 250, igf1DaysSinceDose: 4 });
  });

  it('Increlex 40 mg (program IGF-1), 0,8 mg na podanie → dawka dobowa 2 × 0,8: dose 1,6/29,1 mg/kg/d, doseAbs 1,6 mg/d', () => {
    const w1 = M.przygotujPunkt(A, L, pomiar, wybor({ program: 'IGF-1', preparat: 'Increlex 40 mg', podawana: '0.8' }));
    expect(w1.punkt).toMatchObject({ dose: 1.6 / 29.1, doseUnit: 'mg/kg/d', doseAbs: 1.6, program: 'IGF-1' });
  });

  it('wiek kostny z wiersza trafia do punktu', () => {
    const w1 = M.przygotujPunkt(A, L, M.pomiarWiersza({ ...WIERSZ, wiekKostny: '8.5' }), wybor());
    expect(w1.punkt.boneAge).toBe(8.5);
  });

  it.each([
    ['drugie Włączenie', { typ: 'start' }, 'Punkt „Włączenie leczenia” został już dodany.'],
    ['pusta dawka', { podawana: '' }, 'Upewnij się, że wprowadziłeś poprawne, dodatnie dane: wiek, wagę, wzrost oraz dawkę.'],
    ['dawka 0', { podawana: '0' }, 'Upewnij się, że wprowadziłeś poprawne, dodatnie dane: wiek, wagę, wzrost oraz dawkę.'],
    ['pusty preparat', { preparat: '' }, 'Wybierz program i preparat w formularzu wstecznego punktu.'],
  ])('odmowa: %s — komunikat z VildaGhPunkty, bez punktu', (_n, z, komunikat) => {
    expect(M.przygotujPunkt(A, L, pomiar, wybor(z))).toEqual({ ok: false, komunikat });
  });

  it('drugie Zakończenie — odmowa; pierwsze Zakończenie — punkt', () => {
    const koniec = punkt('fikc-9', 'end', { ageYears: 12 });
    expect(M.przygotujPunkt(A, [...L, koniec], pomiar, wybor({ typ: 'end' }))).toEqual({ ok: false, komunikat: 'Punkt „Zakończenie leczenia” został już dodany.' });
    expect(M.przygotujPunkt(A, L, pomiar, wybor({ typ: 'end' })).punkt.type).toBe('end');
  });

  it('ten sam wynik co formularz wsteczny monitora (VildaGhPunkty.polaZPodawanej z polami jak w ghAddRetroPoint)', () => {
    const w1 = M.przygotujPunkt(A, L, pomiar, wybor({ igf1: '310', dniIgf: '2' }));
    const wsteczny = A.polaZPodawanej({ typ: 'continue', lata: '9', miesiace: '0', masa: '29.1', wzrost: '128.6', wiekKostny: '',
      podawana: '0.9', preparat: 'Omnitrope 10 mg', program: 'SNP', igf1: '310', dniIgf: '2' }, 'wsteczny');
    const { id: _id, ...bezId } = w1.punkt;
    expect(bezId).toEqual(wsteczny.pola);
  });
});

describe('VildaGhProgramyDane', () => {
  it('sześć programów w kolejności pola „Program” karty; IGF-1 wyłącznie z mekaserminą; dane zamrożone', () => {
    expect(D.programy.map((p) => p.kod)).toEqual(['SNP', 'ZT', 'PWS', 'SGA', 'PNN', 'IGF-1']);
    expect(M.preparatyProgramu(D, 'IGF-1')).toEqual(['Increlex 40 mg']);
    expect(M.preparatyProgramu(D, 'SNP')).toEqual(['Omnitrope 5 mg', 'Omnitrope 10 mg', 'Genotropin 5,3 mg', 'Genotropin 12 mg', 'Ngenla 24 mg', 'Ngenla 60 mg']);
    expect(Object.isFrozen(D) && Object.isFrozen(D.programy) && Object.isFrozen(D.programy[0]) && Object.isFrozen(D.programy[0].preparaty)).toBe(true);
    // Każdy preparat programu ma dane dawkowania w VildaGhDawka (schemat, krok).
    for (const p of D.programy) for (const lek of p.preparaty) expect(E.preparat(lek), lek).toBeTruthy();
  });
});
