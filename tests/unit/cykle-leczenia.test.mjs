import { beforeAll, describe, expect, it } from 'vitest';
import { loadBrowserScript } from '../support/load-browser-script.mjs';

// P-OTYLOSC-CYKLE rata 1 (decyzja właściciela 2026-09-30: rekomendacje D1–D8 projektu „Cykle
// leczenia otyłości" przyjęte). Test woła PRODUKCYJNY moduł vilda_cykle_leczenia.js — ten sam plik,
// który DocPro ładuje przed monitorem otyłości — bez własnej kopii reguł.
//
// Przykład z projektu (dane FIKCYJNE): dorosły, 170 cm. Cykl 1 — Saxenda: Włączenie 12.01.2024
// (104,0 kg), Kontynuacja 12.04.2024 (99,0 kg), Zakończenie 15.10.2024 (97,5 kg). Po 28 dniach
// przerwy cykl 2 — Wegovy: Włączenie 12.11.2024 (98,5 kg), Kontynuacje 12.02.2025 i 10.05.2025.

let C;

beforeAll(() => {
  const win = {};
  loadBrowserScript('vilda_cykle_leczenia.js', win);
  C = win.VildaCykleLeczenia;
});

const P = (id, type, lata, mies, masa, data, lek = 'Saxenda') => ({
  id, type, ageYears: lata, ageMonths: mies, weight: masa, height: 170, dateISO: data, drug: lek, dose: '',
});
const CYKL1 = Object.freeze([
  P('a', 'start', 40, 0, 104, '2024-01-12'),
  P('b', 'continue', 40, 3, 99, '2024-04-12'),
  P('c', 'end', 40, 9, 97.5, '2024-10-15'),
]);
const CYKL2 = Object.freeze([
  P('d', 'start', 40, 10, 98.5, '2024-11-12', 'Wegovy'),
  P('e', 'continue', 41, 1, 95.5, '2025-02-12', 'Wegovy'),
  P('f', 'continue', 41, 4, 93, '2025-05-10', 'Wegovy'),
]);
const OBA = Object.freeze([...CYKL1, ...CYKL2]);
const dodaj = (lista, punkt, opcje) => C.sprawdz(lista, { rodzaj: 'dodaj', punkt }, opcje);

describe('podział na cykle', () => {
  it('granicę cyklu wyznacza Zakończenie; przykład z projektu to dwa cykle', () => {
    const w = C.podziel(OBA);
    expect(w.tryb).toBe('daty');
    expect(w.cykle.map((c) => c.punkty.map((p) => p.id).join(''))).toEqual(['abc', 'def']);
    expect(w.cykle.map((c) => c.stan)).toEqual(['zakonczony', 'aktywny']);
    expect(w.cykle[1].wlaczenie.id).toBe('d');
    expect(w.niezgodnosci).toEqual([]);
  });

  it('kolejność jak w tabeli monitora: po datach, a gdy któryś punkt nie ma daty — po wieku', () => {
    const pomieszane = [OBA[4], OBA[0], OBA[3], OBA[2], OBA[5], OBA[1]];
    expect(C.uporzadkuj(pomieszane).punkty.map((p) => p.id).join('')).toBe('abcdef');
    const bezDaty = pomieszane.map((p) => (p.id === 'e' ? { ...p, dateISO: '' } : p));
    const u = C.uporzadkuj(bezDaty);
    expect(u.tryb).toBe('wiek');
    expect(u.punkty.map((p) => p.id).join('')).toBe('abcdef');
  });

  it('stary zapis z dwoma Włączeniami bez Zakończenia to JEDEN cykl z niezgodnością, nie dwa cykle', () => {
    const stary = [...CYKL1.slice(0, 2), P('g', 'start', 40, 4, 99, '2024-05-03'), P('h', 'continue', 40, 8, 96, '2024-09-01')];
    const w = C.podziel(stary);
    expect(w.cykle.length).toBe(1);
    expect(w.niezgodnosci.map((n) => n.kod)).toEqual(['dwa-wlaczenia']);
    expect(w.cykle[0].wlaczenie.id).toBe('a');
  });

  it('Kontynuacja po Zakończeniu otwiera cykl bez Włączenia (dotychczasowy przypadek P-OTYLOSC-BEZ-STARTU)', () => {
    const w = C.podziel([...CYKL1, P('k', 'continue', 41, 0, 100, '2025-01-10')]);
    expect(w.cykle.length).toBe(2);
    expect(w.cykle[1].wlaczenie).toBeNull();
    expect(w.niezgodnosci).toEqual([]);
  });
});

describe('dodawanie punktu — przypadki z projektu', () => {
  it('CY-1: drugie Włączenie w trakcie cyklu jest odrzucane', () => {
    const r = dodaj(CYKL1.slice(0, 2), P('x', 'start', 40, 5, 98, '2024-06-10'));
    expect(r.ok).toBe(false);
    expect(r.kod).toBe('dwa-wlaczenia');
    expect(r.komunikat).toBe('Cykl 1 ma już Włączenie (12.01.2024). Nowy cykl rozpoczniesz po Zakończeniu cyklu 1.');
  });

  it('CY-2: Włączenie po Zakończeniu zaczyna cykl 2', () => {
    const r = dodaj(CYKL1, CYKL2[0]);
    expect(r.ok).toBe(true);
    expect(r.cykl).toEqual({ numer: 2, stan: 'aktywny' });
    expect(r.punkty.map((p) => p.id).join('')).toBe('abcd');
  });

  it('CY-4: Kontynuacja z datą w przerwie między cyklami jest odrzucana', () => {
    const r = dodaj(OBA, P('x', 'continue', 40, 9, 97, '2024-11-01'));
    expect(r.ok).toBe(false);
    expect(r.kod).toBe('przerwa');
    expect(r.komunikat).toBe('Data 01.11.2024 wypada w przerwie między cyklem 1 (zakończony 15.10.2024) a cyklem 2 (Włączenie 12.11.2024). Popraw datę wizyty.');
  });

  it('CY-5: Zakończenie przed późniejszą wizytą cyklu jest odrzucane', () => {
    const r = dodaj(CYKL1.slice(0, 2), P('x', 'end', 40, 2, 100, '2024-03-10'));
    expect(r.ok).toBe(false);
    expect(r.kod).toBe('zakonczenie-nie-ostatnie');
    expect(r.komunikat).toBe('Po 10.03.2024 w cyklu 1 są jeszcze wizyty (1). Zakończenie musi być ostatnim punktem cyklu.');
  });

  it('CY-8: Zakończenie i nowe Włączenie tego samego dnia to dwa cykle, Zakończenie pierwsze', () => {
    const z = P('z', 'end', 40, 9, 97.5, '2024-10-15');
    const r1 = dodaj(CYKL1.slice(0, 2), z);
    expect(r1.ok).toBe(true);
    const r2 = dodaj(r1.punkty, P('w', 'start', 40, 9, 97.5, '2024-10-15', 'Wegovy'));
    expect(r2.ok).toBe(true);
    expect(r2.cykl.numer).toBe(2);
    expect(C.podziel(r2.punkty).cykle.map((c) => c.punkty.map((p) => p.id).join(''))).toEqual(['abz', 'w']);
  });

  it('remis dat: Włączenie dopisane wstecz w dniu pierwszej wizyty cyklu bez Włączenia trafia przed nią', () => {
    const bez = [P('k1', 'continue', 41, 0, 100, '2025-01-10'), P('k2', 'continue', 41, 3, 97, '2025-04-10')];
    const r = dodaj(bez, P('w', 'start', 41, 0, 100, '2025-01-10'));
    expect(r.ok).toBe(true);
    expect(r.indeks).toBe(0);
    expect(C.podziel(r.punkty).cykle[0].wlaczenie.id).toBe('w');
  });

  it('Włączenie w środku cyklu bez Włączenia jest odrzucane — musi być pierwszym punktem', () => {
    const bez = [P('k1', 'continue', 41, 0, 100, '2025-01-10'), P('k2', 'continue', 41, 3, 97, '2025-04-10')];
    const r = dodaj(bez, P('w', 'start', 41, 1, 99, '2025-02-10'));
    expect(r.ok).toBe(false);
    expect(r.kod).toBe('wlaczenie-w-trakcie');
  });

  it('Kontynuacja sprzed pierwszego Włączenia jest odrzucana', () => {
    const r = dodaj(CYKL1, P('x', 'continue', 39, 11, 105, '2023-12-01'));
    expect(r.ok).toBe(false);
    expect(r.kod).toBe('przed-wlaczeniem');
  });

  it('drugie Zakończenie jest odrzucane — po Zakończeniu i przed nim', () => {
    expect(dodaj(CYKL1, P('x', 'end', 41, 0, 96, '2024-12-01')).kod).toBe('drugie-zakonczenie');
    const r = dodaj(CYKL1, P('x', 'end', 40, 5, 98, '2024-06-01'));
    expect(r.kod).toBe('drugie-zakonczenie');
    expect(r.komunikat).toBe('Cykl 1 ma już Zakończenie (15.10.2024).');
    expect(dodaj([], P('x', 'end', 41, 0, 100, '2025-01-10')).kod).toBe('zakonczenie-bez-wizyt');
  });
});

describe('cykl bez Włączenia tylko świadomie (D2)', () => {
  it('Kontynuacja po zakończonym cyklu wymaga wyboru', () => {
    const r = dodaj(CYKL1, P('x', 'continue', 41, 0, 100, '2025-01-10'));
    expect(r.ok).toBe(false);
    expect(r.wybor).toBe(true);
    expect(r.kod).toBe('nowy-cykl-bez-wlaczenia');
    expect(r.cyklPoprzedni).toBe(1);
    expect(r.komunikat).toContain('Cykl 1 jest zakończony (15.10.2024). Ta wizyta rozpocznie cykl 2.');
  });

  it('po świadomym wyborze wizyta zaczyna cykl bez Włączenia', () => {
    const r = dodaj(CYKL1, P('x', 'continue', 41, 0, 100, '2025-01-10'), { bezWlaczenia: true });
    expect(r.ok).toBe(true);
    expect(r.cykl).toEqual({ numer: 2, stan: 'aktywny' });
  });

  it('pierwszy punkt jako Kontynuacja też wymaga wyboru', () => {
    const r = dodaj([], P('x', 'continue', 41, 0, 100, '2025-01-10'));
    expect(r.wybor).toBe(true);
    expect(r.cyklPoprzedni).toBeNull();
    expect(r.komunikat).toContain('To pierwszy punkt leczenia.');
  });

  it('kolejna wizyta w istniejącym cyklu bez Włączenia nie pyta ponownie', () => {
    const bez = [P('k1', 'continue', 41, 0, 100, '2025-01-10')];
    expect(dodaj(bez, P('k2', 'continue', 41, 3, 97, '2025-04-10')).ok).toBe(true);
  });
});

describe('data przy Włączeniu i Zakończeniu (R7, D4)', () => {
  it('nowe Włączenie i nowe Zakończenie bez daty są odrzucane', () => {
    expect(dodaj([], P('x', 'start', 41, 0, 100, '')).kod).toBe('brak-daty');
    expect(dodaj(CYKL1.slice(0, 2), P('x', 'end', 41, 0, 96, '')).kod).toBe('brak-daty');
  });

  it('Kontynuacja bez daty przechodzi jak dotąd', () => {
    expect(dodaj(CYKL1.slice(0, 2), P('x', 'continue', 40, 5, 98, '')).ok).toBe(true);
  });

  it('stare Włączenie bez daty wolno poprawić bez dopisywania daty, dopóki nie zmienia rodzaju', () => {
    const stary = [P('s', 'start', 40, 0, 104, ''), P('k', 'continue', 40, 3, 99, '')];
    expect(C.sprawdz(stary, { rodzaj: 'edytuj', id: 's', punkt: { ...stary[0], weight: 103 } }).ok).toBe(true);
    expect(C.sprawdz(stary, { rodzaj: 'edytuj', id: 'k', punkt: { ...stary[1], type: 'end' } }).kod).toBe('brak-daty');
  });
});

describe('edycja i usuwanie', () => {
  it('CY-3: Włączenie cyklu 2 da się poprawić jako Włączenie (dotąd odmowa „drugi-start")', () => {
    const r = C.sprawdz(OBA, { rodzaj: 'edytuj', id: 'd', punkt: { ...CYKL2[0], weight: 98 } });
    expect(r.ok).toBe(true);
    expect(r.indeks).toBe(3);
    expect(r.punkty[3].weight).toBe(98);
    // pozostałe punkty to te same obiekty — nic poza edytowanym się nie zmienia
    expect(r.punkty.filter((p, i) => i !== 3).every((p, i) => p === OBA.filter((q, j) => j !== 3)[i])).toBe(true);
  });

  it('zmiana Kontynuacji w drugie Włączenie tego samego cyklu jest odrzucana', () => {
    const r = C.sprawdz(OBA, { rodzaj: 'edytuj', id: 'e', punkt: { ...CYKL2[1], type: 'start' } });
    expect(r.kod).toBe('dwa-wlaczenia');
  });

  it('zmiana daty przenosząca punkt do innego cyklu wymaga potwierdzenia', () => {
    const r = C.sprawdz(OBA, { rodzaj: 'edytuj', id: 'b', punkt: { ...CYKL1[1], dateISO: '2025-03-01', ageYears: 41, ageMonths: 2 } });
    expect(r.ok).toBe(true);
    expect(r.uwaga).toBe('przeniesienie');
    expect(r.potwierdz).toBe('Nowa data przenosi punkt z cyklu 1 do cyklu 2. Zapisać zmiany?');
  });

  it('zamiana Zakończenia między cyklami w Kontynuację jest odrzucana — połączyłaby cykle', () => {
    const r = C.sprawdz(OBA, { rodzaj: 'edytuj', id: 'c', punkt: { ...CYKL1[2], type: 'continue' } });
    expect(r.kod).toBe('polaczenie-cykli');
  });

  it('CY-6: usunięcie Zakończenia między cyklami jest odrzucane', () => {
    const r = C.sprawdz(OBA, { rodzaj: 'usun', id: 'c' });
    expect(r.ok).toBe(false);
    expect(r.kod).toBe('polaczenie-cykli');
    expect(r.komunikat).toBe('Usunięcie tego Zakończenia połączyłoby cykl 1 z cyklem 2. Najpierw usuń albo zmień Włączenie cyklu 2 (12.11.2024).');
  });

  it('usunięcie Zakończenia ostatniego cyklu przechodzi — cykl znów jest aktywny', () => {
    const r = C.sprawdz(CYKL1, { rodzaj: 'usun', id: 'c' });
    expect(r.ok).toBe(true);
    expect(r.punkty.map((p) => p.id).join('')).toBe('ab');
  });

  it('usunięcie Włączenia pyta z podaniem skutku dla Karty pacjenta', () => {
    const r = C.sprawdz(OBA, { rodzaj: 'usun', id: 'd' });
    expect(r.ok).toBe(true);
    expect(r.uwaga).toBe('utrata-wlaczenia');
    expect(r.potwierdz).toContain('Cykl 2 straci punkt odniesienia (Włączenie 12.11.2024).');
  });
});

describe('stary zapis łamiący reguły (D5): nic nie zmienia się samo, poprawka przechodzi', () => {
  const STARY = Object.freeze([...CYKL1.slice(0, 2), P('g', 'start', 40, 4, 99, '2024-05-03'), P('h', 'continue', 40, 8, 96, '2024-09-01')]);

  it('dopisanie wizyty do cyklu z dawną niezgodnością nie jest blokowane', () => {
    expect(dodaj(STARY, P('x', 'continue', 40, 10, 95, '2024-11-01')).ok).toBe(true);
  });

  it('zamiana drugiego Włączenia w Kontynuację usuwa niezgodność', () => {
    const r = C.sprawdz(STARY, { rodzaj: 'edytuj', id: 'g', punkt: { ...STARY[2], type: 'continue' } });
    expect(r.ok).toBe(true);
    expect(C.podziel(r.punkty).niezgodnosci).toEqual([]);
  });

  it('trzecie Włączenie w tym cyklu nadal jest odrzucane', () => {
    expect(dodaj(STARY, P('x', 'start', 40, 10, 95, '2024-11-01')).kod).toBe('dwa-wlaczenia');
  });
});
